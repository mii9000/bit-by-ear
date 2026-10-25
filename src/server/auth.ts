import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { pool, withTransaction } from './db.js';
import { config } from './config.js';

const scrypt = promisify(scryptCallback);
const cookieName = 'bit_by_ear_session';
const sessionDays = 7;

type Account = { id: string; email: string };
type Session = { user_id: string; email: string; csrf_token: string };

declare global {
  namespace Express {
    interface Request {
      user?: Account;
      csrfToken?: string;
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readCookie(request: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
}

function setCookie(response: Response, token: string, maxAgeSeconds: number): void {
  const secure = config.isProduction ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

async function checkRateLimit(key: string, limit: number, durationSeconds: number): Promise<boolean> {
  const result = await pool.query<{ allowed: boolean }>(
    `INSERT INTO rate_limits(bucket, count, resets_at)
     VALUES ($1, 1, now() + ($3::text || ' seconds')::interval)
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE WHEN rate_limits.resets_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
       resets_at = CASE WHEN rate_limits.resets_at <= now() THEN now() + ($3::text || ' seconds')::interval ELSE rate_limits.resets_at END
     RETURNING count <= $2 AS allowed`,
    [key, limit, durationSeconds],
  );
  return result.rows[0]?.allowed ?? false;
}

async function createSession(account: Account, response: Response): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  await pool.query('INSERT INTO sessions(user_id, token_hash, csrf_token, expires_at) VALUES ($1, $2, $3, now() + interval \'7 days\')', [account.id, sha256(token), csrfToken]);
  setCookie(response, token, sessionDays * 24 * 60 * 60);
  return csrfToken;
}

export function originAndCsrf(request: Request, response: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  const origin = request.headers.origin;
  const bodyToken = typeof request.body?.csrfToken === 'string' ? request.body.csrfToken : undefined;
  const originMatches = hasMatchingOrigin(origin);
  if (!originMatches || !request.user || (request.headers['x-csrf-token'] !== request.csrfToken && bodyToken !== request.csrfToken)) {
    response.status(403).json({ error: 'Your session expired. Refresh the page and try again.' });
    return;
  }
  next();
}

export function requireSameOrigin(request: Request, response: Response, next: NextFunction): void {
  if (hasMatchingOrigin(request.headers.origin)) return next();
  response.status(403).json({ error: 'This request did not come from this app.' });
}

function hasMatchingOrigin(origin: string | undefined): boolean {
  return origin === config.appOrigin || (!config.isProduction && isLocalOriginAlias(origin, config.appOrigin));
}

function isLocalOriginAlias(origin: string | undefined, expectedOrigin: string): boolean {
  if (!origin) return false;
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  try {
    const actual = new URL(origin);
    const expected = new URL(expectedOrigin);
    return actual.protocol === expected.protocol
      && actual.port === expected.port
      && loopbackHosts.has(actual.hostname)
      && loopbackHosts.has(expected.hostname);
  } catch {
    return false;
  }
}

export async function requireUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  const token = readCookie(request, cookieName);
  if (!token) {
    response.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  const result = await pool.query<Session>(
    `SELECT s.user_id, u.email, s.csrf_token FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  const session = result.rows[0];
  if (!session) {
    response.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  request.user = { id: session.user_id, email: session.email };
  request.csrfToken = session.csrf_token;
  next();
}

export async function signUp(request: Request, response: Response): Promise<void> {
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  const clientAddress = request.ip || 'local';
  const allowed = await checkRateLimit(`signup:${clientAddress}`, 10, 3600);
  if (!allowed) {
    response.status(429).json({ error: 'Too many attempts. Try again in a little while.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 200) {
    response.status(400).json({ error: 'Use a valid email address and a password with at least 10 characters.' });
    return;
  }

  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  try {
    const account = await withTransaction(async (client) => {
      const count = await client.query<{ count: string }>('SELECT count(*) FROM users');
      if (Number(count.rows[0]?.count ?? 0) >= 50) throw new Error('SIGNUP_CAP');
      const inserted = await client.query<Account>(
        'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, `${salt}:${hash.toString('hex')}`],
      );
      return inserted.rows[0]!;
    });
    const csrfToken = await createSession(account, response);
    response.status(201).json({ user: account, csrfToken });
  } catch (error) {
    if (error instanceof Error && error.message === 'SIGNUP_CAP') {
      response.status(403).json({ error: 'This early access demo has reached its account limit.' });
      return;
    }
    if ((error as { code?: string }).code === '23505') {
      response.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    throw error;
  }
}

export async function signIn(request: Request, response: Response): Promise<void> {
  const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  const identifier = createHash('sha256').update(`${request.ip}:${email}`).digest('hex');
  if (!await checkRateLimit(`login:${identifier}`, 10, 900)) {
    response.status(429).json({ error: 'Too many attempts. Wait 15 minutes before trying again.' });
    return;
  }
  if (email.length > 254 || password.length > 200) {
    response.status(401).json({ error: 'Email or password did not match.' });
    return;
  }
  const found = await pool.query<Account & { password_hash: string }>('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
  const row = found.rows[0];
  const [salt, expectedHex] = row ? row.password_hash.split(':') : ['', ''];
  const expected = Buffer.from(expectedHex || '', 'hex');
  const actual = salt ? (await scrypt(password, salt, 64)) as Buffer : randomBytes(64);
  if (!row || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    response.status(401).json({ error: 'Email or password did not match.' });
    return;
  }
  const csrfToken = await createSession(row, response);
  response.json({ user: { id: row.id, email: row.email }, csrfToken });
}

export async function session(request: Request, response: Response): Promise<void> {
  if (!request.user) {
    response.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  response.json({ user: request.user, csrfToken: request.csrfToken });
}

export async function signOut(request: Request, response: Response): Promise<void> {
  const token = readCookie(request, cookieName);
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  setCookie(response, '', 0);
  response.status(204).end();
}
