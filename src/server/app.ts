import express, { Router } from 'express';
import { resolve } from 'node:path';
import { config } from './config.js';
import { pool } from './db.js';
import { requireUser, originAndCsrf, signIn, signOut, signUp, session } from './auth.js';
import { knowledgeRouter } from './knowledge.js';
import { courseRouter } from './courses.js';
import { episodeRouter } from './episodes.js';
import { pushRouter } from './push.js';

export function createApp() {
  const app = express();
  if (config.isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(express.text({ type: 'application/json', limit: '10kb' }));

  app.get('/health', async (_request, response) => {
    try {
      await pool.query('SELECT 1');
      response.json({ status: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  const authRouter = Router();
  authRouter.post('/signup', signUp);
  authRouter.post('/login', signIn);
  app.use('/api/auth', authRouter);

  app.get('/api/session', requireUser, session);
  app.post('/api/auth/logout', requireUser, originAndCsrf, signOut);
  app.get('/api/health', async (_request, response) => {
    try {
      await pool.query('SELECT 1');
      response.json({ status: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api', requireUser, originAndCsrf);
  app.use('/api/knowledge-bases', knowledgeRouter);
  app.use('/api/courses', courseRouter);
  app.use('/api', episodeRouter);
  app.use('/api', pushRouter);

  if (config.isProduction) {
    const assets = resolve(process.cwd(), 'dist/client');
    app.use(express.static(assets, { etag: true, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_request, response) => response.sendFile(resolve(assets, 'index.html')));
  } else {
    app.get('/', (_request, response) => response.type('text/plain').send('Bit by Ear API is ready. Open the Vite app on port 5173.'));
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const uploadError = error as { code?: string; message?: string };
    if (uploadError.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ error: 'Each resource must be smaller than 5 MB.' });
      return;
    }
    console.error(JSON.stringify({ event: 'request_failed', message: (error instanceof Error ? error.message : 'failed').slice(0, 180) }));
    response.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
