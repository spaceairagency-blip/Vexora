import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { assertSafePublicUrl, getVexoraApp } from './server/app.js';
import { attachVexoraWsProxy } from './server/wsProxy.js';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = await getVexoraApp();
  const httpServer = http.createServer(app);

  attachVexoraWsProxy(httpServer, assertSafePublicUrl);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Vexora Browser listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
