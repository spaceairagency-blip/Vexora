import type { IncomingMessage, ServerResponse } from 'node:http';
import { getVexoraApp } from '../server/app.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const vxPath = parsed.searchParams.get('__vx_path');
    if (vxPath) {
      parsed.searchParams.delete('__vx_path');
      const qs = parsed.searchParams.toString();
      req.url = qs ? `${vxPath}?${qs}` : vxPath;
    }

    const app = await getVexoraApp();

    await new Promise<void>((resolve, reject) => {
      if (res.writableEnded) {
        resolve();
        return;
      }
      const cleanup = () => {
        res.off('finish', onDone);
        res.off('close', onDone);
        res.off('error', onErr);
      };
      const onDone = () => {
        cleanup();
        resolve();
      };
      const onErr = (err: Error) => {
        cleanup();
        reject(err);
      };
      res.once('finish', onDone);
      res.once('close', onDone);
      res.once('error', onErr);

      app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
    });
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Serverless function invocation failed',
        })
      );
    }
  }
}
