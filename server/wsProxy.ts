import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { buildCookieHeader, getJarKeyFromUpgrade } from './cookieJar.js';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function attachVexoraWsProxy(
  server: HttpServer,
  assertSafePublicUrl: (raw: string) => Promise<URL>
): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const hostHeader = req.headers.host || 'localhost:3000';
    let reqUrl: URL;
    try {
      reqUrl = new URL(req.url || '/', `http://${hostHeader}`);
    } catch {
      socket.destroy();
      return;
    }

    if (reqUrl.pathname !== '/proxy-ws') {
      return;
    }

    const rawTarget = reqUrl.searchParams.get('target') || '';
    const isPriv = reqUrl.searchParams.get('p') === '1';

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawTarget);
    } catch {
      socket.destroy();
      return;
    }

    if (targetUrl.protocol !== 'ws:' && targetUrl.protocol !== 'wss:') {
      socket.destroy();
      return;
    }

    try {
      const httpCheckUrl = `${targetUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${targetUrl.host}${targetUrl.pathname}`;
      await assertSafePublicUrl(httpCheckUrl);
    } catch {
      socket.destroy();
      return;
    }

    const jarKey = getJarKeyFromUpgrade(req, isPriv);
    const httpEquivalent = new URL(
      `${targetUrl.protocol === 'wss:' ? 'https:' : 'http:'}//${targetUrl.host}${targetUrl.pathname}`
    );
    const cookieHeader = jarKey ? buildCookieHeader(jarKey, httpEquivalent) : '';
    const protocols = req.headers['sec-websocket-protocol']
      ? req.headers['sec-websocket-protocol'].split(',').map((p) => p.trim())
      : undefined;

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      const headers: Record<string, string> = {
        Origin: httpEquivalent.origin,
        'User-Agent': CHROME_UA,
      };
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      const upstreamWs = new WebSocket(targetUrl.href, protocols, { headers });
      const queue: Array<{ data: Buffer | string; isBinary: boolean }> = [];

      upstreamWs.on('open', () => {
        for (const item of queue) {
          upstreamWs.send(item.data, { binary: item.isBinary });
        }
        queue.length = 0;
      });

      upstreamWs.on('message', (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      clientWs.on('message', (data, isBinary) => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(data, { binary: isBinary });
        } else if (upstreamWs.readyState === WebSocket.CONNECTING) {
          queue.push({
            data: Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer),
            isBinary,
          });
        }
      });

      upstreamWs.on('close', (code) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(code >= 1000 && code <= 4999 ? code : 1000);
        }
      });

      clientWs.on('close', () => {
        if (
          upstreamWs.readyState === WebSocket.OPEN ||
          upstreamWs.readyState === WebSocket.CONNECTING
        ) {
          upstreamWs.close();
        }
      });

      upstreamWs.on('error', () => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, 'Upstream WebSocket error');
        }
      });

      clientWs.on('error', () => {
        upstreamWs.terminate();
      });
    });
  });
}
