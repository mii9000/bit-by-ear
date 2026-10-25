import { Router } from 'express';
import { z } from 'zod';
import { pool } from './db.js';
import { config } from './config.js';

export const pushRouter = Router();
const endpointHost = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'push.services.mozilla.com']);
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(20).max(300), auth: z.string().min(12).max(100) }),
});

pushRouter.get('/push/public-key', (_request, response) => {
  response.json({ enabled: Boolean(config.vapidPublic && config.vapidPrivate), publicKey: config.vapidPublic || null });
});

pushRouter.post('/push/subscriptions', async (request, response) => {
  if (!config.vapidPublic || !config.vapidPrivate) {
    response.status(503).json({ error: 'Notifications are not configured yet. Episodes will still appear in your library.' });
    return;
  }
  const parsed = subscriptionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'The browser notification subscription was invalid.' });
    return;
  }
  const endpoint = new URL(parsed.data.endpoint);
  if (endpoint.protocol !== 'https:' || !endpointHost.has(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.port) {
    response.status(400).json({ error: 'This browser’s notification service is not supported.' });
    return;
  }
  await pool.query(
    `INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3)
     ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription`,
    [request.user!.id, parsed.data.endpoint, parsed.data],
  );
  response.status(201).json({ enabled: true });
});

pushRouter.delete('/push/subscriptions', async (request, response) => {
  const endpoint = typeof request.body.endpoint === 'string' ? request.body.endpoint : '';
  if (endpoint) await pool.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [endpoint, request.user!.id]);
  response.status(204).end();
});
