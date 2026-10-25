import { beforeEach, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/server/db.js', () => ({
  pool: { query },
  withTransaction: vi.fn(),
}));

import { requireSameOrigin, signOut } from '../src/server/auth.js';
import type { Request, Response } from 'express';

beforeEach(() => { query.mockReset().mockResolvedValue({ rows: [] }); });

it('expires a stale session cookie when signing out', async () => {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
  } as unknown as Response;

  await signOut({ headers: { cookie: 'bit_by_ear_session=stale-token' } } as Request, response);

  expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sessions'), [expect.any(String)]);
  expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('Max-Age=0'));
  expect(response.status).toHaveBeenCalledWith(204);
});

it('allows logout only from the configured app origin', () => {
  const next = vi.fn();
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;

  requireSameOrigin({ headers: { origin: 'http://localhost:5173' } } as Request, response, next);
  expect(next).toHaveBeenCalledOnce();

  const rejectedNext = vi.fn();
  requireSameOrigin({ headers: { origin: 'https://attacker.example' } } as Request, response, rejectedNext);
  expect(rejectedNext).not.toHaveBeenCalled();
  expect(response.status).toHaveBeenCalledWith(403);
});
