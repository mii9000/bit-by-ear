import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from './db.js';

export type JobKind = 'extract' | 'plan' | 'approve' | 'script' | 'audio' | 'push';
export type ClaimedJob = { id: string; kind: JobKind; job_key: string; entity_id: string; lease_token: string; attempts: number };

export async function enqueueJob(client: PoolClient, kind: JobKind, key: string, entityId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO jobs(kind, job_key, entity_id) VALUES ($1,$2,$3)
     ON CONFLICT (job_key) DO UPDATE SET job_key=EXCLUDED.job_key
     RETURNING id`,
    [kind, key, entityId],
  );
  return result.rows[0]!.id;
}

export async function claimJob(now = new Date()): Promise<ClaimedJob | null> {
  return withTransaction(async (client) => {
    const found = await client.query<{ id: string }>(
      `SELECT id FROM jobs WHERE available_at <= $1 AND (status='pending' OR (status='running' AND lease_expires_at <= $1))
       ORDER BY available_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [now],
    );
    const id = found.rows[0]?.id;
    if (!id) return null;
    const claimed = await client.query<ClaimedJob>(
      `UPDATE jobs SET status='running', attempts=attempts+1, lease_token=$2, lease_expires_at=$3, updated_at=$1
       WHERE id=$4 RETURNING id,kind,job_key,entity_id,lease_token,attempts`,
      [now, randomUUID(), new Date(now.getTime() + 5 * 60 * 1000), id],
    );
    return claimed.rows[0] ?? null;
  });
}

export async function completeJob(job: ClaimedJob): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,updated_at=now(),error_message=NULL
     WHERE id=$1 AND status='running' AND lease_token=$2`,
    [job.id, job.lease_token],
  );
}

export async function failJob(job: ClaimedJob, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : 'Job failed.').slice(0, 500);
  const transient = error instanceof Error && (error.name === 'AbortError' || /rate limit|temporar|timeout|unavailable|returned 5\d\d|truncated/i.test(message));
  const canRetry = transient && job.attempts < 3;
  const delaySeconds = job.attempts === 1 ? 60 : 300;
  await pool.query(
    `UPDATE jobs SET status=$3,available_at=CASE WHEN $3='pending' THEN now()+($4::text || ' seconds')::interval ELSE available_at END,
      lease_token=NULL,lease_expires_at=NULL,error_message=$5,updated_at=now()
     WHERE id=$1 AND status='running' AND lease_token=$2`,
    [job.id, job.lease_token, canRetry ? 'pending' : 'failed', delaySeconds, message],
  );
  await setEntityFailure(job, message, canRetry);
}

async function setEntityFailure(job: ClaimedJob, message: string, willRetry: boolean): Promise<void> {
  if (willRetry) return;
  if (job.kind === 'extract') {
    await pool.query(`UPDATE resources SET status='failed',error_message=$2 WHERE id=$1`, [job.entity_id, message]);
  } else if (job.kind === 'script' || job.kind === 'audio') {
    await pool.query(`UPDATE episodes SET state='failed',error_message=$2 WHERE id=$1 AND state <> 'ready'`, [job.entity_id, message]);
  } else if (job.kind === 'plan' || job.kind === 'approve') {
    await pool.query(
      `UPDATE courses SET state='draft',updated_at=now() WHERE ($1='plan' AND knowledge_base_id=$2) OR ($1='approve' AND id=$2)`,
      [job.kind, job.entity_id],
    );
  }
}
