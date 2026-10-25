import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from './db.js';
import { ownedKnowledgeBase } from './knowledge.js';
import { enqueueJob } from './jobs.js';
import { isSupportedTimeZone, nextLocalSlot, localDateAt } from './schedule.js';
import { planDraftSchema } from '../shared/plan.js';

export const courseRouter = Router();

function kbId(request: { params: Record<string, string | undefined> }): string { return String(request.params.id || ''); }
function ownerId(request: { user?: { id: string } }): string { return request.user!.id; }

courseRouter.get('/:id', async (request, response) => {
  const result = await pool.query(
    `SELECT k.id,k.title,k.topic,k.goal,k.current_knowledge AS "currentKnowledge",k.revision AS "sourceRevision",
            c.id AS "courseId",c.state,c.plan,c.plan_revision AS revision,c.source_revision AS "planSourceRevision",
            c.approved_plan AS "approvedPlan",c.timezone,
            to_char(c.delivery_time,'HH24:MI') AS "deliveryTime",c.next_due_at AS "nextDueAt",
            (SELECT jsonb_build_object('status',j.status,'error',j.error_message) FROM jobs j
             WHERE j.kind='plan' AND j.entity_id=k.id ORDER BY j.created_at DESC LIMIT 1) AS "planJob",
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'index',e.lesson_index,'title',e.title,'state',e.state,
              'durationSeconds',e.duration_seconds,'progressSeconds',e.progress_seconds,'finished',e.finished,
              'error',e.error_message,'readyAt',e.ready_at) ORDER BY e.lesson_index)
             FROM episodes e WHERE e.course_id=c.id), '[]'::jsonb) AS episodes
     FROM knowledge_bases k JOIN courses c ON c.knowledge_base_id=k.id
     WHERE k.id=$1 AND k.owner_id=$2`,
    [kbId(request), ownerId(request)],
  );
  if (!result.rowCount) {
    response.status(404).json({ error: 'Knowledge base not found.' });
    return;
  }
  const resources = await pool.query(
    `SELECT id,filename,media_type AS "mediaType",status,error_message AS error,length(extracted_text)::int AS "characters"
     FROM resources WHERE knowledge_base_id=$1 ORDER BY created_at`,
    [kbId(request)],
  );
  response.json({ course: result.rows[0], resources: resources.rows });
});

courseRouter.post('/:id/plan/generate', async (request, response) => {
  const input = z.object({ requestedCount: z.number().int().min(3).max(30).optional(), requestId: z.string().uuid().optional() }).safeParse(request.body || {});
  if (!input.success) {
    response.status(400).json({ error: 'Choose a course length between 3 and 30 days.' });
    return;
  }
  const job = await withTransaction(async (client) => {
    const found = await ownedKnowledgeBase(client, kbId(request), ownerId(request), true);
    if (!found.rowCount) return { error: 'Knowledge base not found.', status: 404 };
    const kb = found.rows[0] as { id: string; revision: number; course_id: string; course_state: string };
    if (kb.course_state !== 'draft') return { error: 'This course is already approved.', status: 409 };
    const ready = await client.query("SELECT count(*)::int AS count FROM resources WHERE knowledge_base_id=$1 AND status='ready'", [kb.id]);
    const pending = await client.query("SELECT count(*)::int AS count FROM resources WHERE knowledge_base_id=$1 AND status <> 'ready'", [kb.id]);
    if (!Number(ready.rows[0]?.count)) return { error: 'Add at least one ready resource first.', status: 400 };
    if (Number(pending.rows[0]?.count)) return { error: 'Wait for all resources to finish processing.', status: 409 };
    const key = `plan:${kb.id}:${kb.revision}:${input.data.requestedCount ?? 'proposed'}:${input.data.requestId || 'default'}`;
    const jobId = await enqueueJob(client, 'plan', key, kb.id);
    return { jobId, status: 202 };
  });
  response.status(job.status).json(job);
});

courseRouter.patch('/:id/plan', async (request, response) => {
  const input = z.object({ revision: z.number().int().positive(), plan: planDraftSchema }).safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: 'Check the lesson titles, objectives, sources, and course length (3–30 lessons).' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const found = await ownedKnowledgeBase(client, kbId(request), ownerId(request), true);
    if (!found.rowCount) return { error: 'Knowledge base not found.', status: 404 };
    const row = found.rows[0] as { id: string; revision: number; course_id: string; course_state: string; plan_revision: number; source_revision: number };
    if (row.course_state !== 'draft') return { error: 'The plan is locked once the course is approved.', status: 409 };
    if (row.source_revision !== row.revision) return { error: 'Your source materials changed. Generate a fresh plan before saving.', status: 409 };
    if (row.plan_revision !== input.data.revision) return { error: 'This plan changed. Refresh it before saving your edits.', status: 409 };
    const excerpts = await client.query('SELECT id, extracted_text, pages FROM resources WHERE knowledge_base_id=$1', [row.id]);
    for (const lesson of input.data.plan.lessons) {
      for (const ref of lesson.sourceRefs) {
        const source = excerpts.rows.find((item: { id: string }) => item.id === ref.resourceId);
        const sourceText = ref.page ? (source?.pages as { page: number; text: string }[])?.find((page) => page.page === ref.page)?.text : source?.extracted_text;
        if (!sourceText?.includes(ref.excerpt)) return { error: `The excerpt for “${lesson.title}” must match its original resource.`, status: 400 };
      }
    }
    const updated = await client.query(
      'UPDATE courses SET plan=$2,plan_revision=plan_revision+1,updated_at=now() WHERE id=$1 RETURNING plan_revision AS revision',
      [row.course_id, input.data.plan],
    );
    return { revision: updated.rows[0]?.revision, status: 200 };
  });
  response.status(result.status).json(result);
});

courseRouter.post('/:id/plan/approve', async (request, response) => {
  const input = z.object({ revision: z.number().int().positive(), timezone: z.string().min(1).max(80), deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).safeParse(request.body);
  if (!input.success || !isSupportedTimeZone(input.data?.timezone || '')) {
    response.status(400).json({ error: 'Choose a supported time zone, course revision, and delivery time.' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const found = await ownedKnowledgeBase(client, kbId(request), ownerId(request), true);
    if (!found.rowCount) return { error: 'Knowledge base not found.', status: 404 };
    const row = found.rows[0] as { id: string; revision: number; course_id: string; course_state: string; plan_revision: number; source_revision: number; plan: unknown };
    if (row.course_state === 'validating') return { status: 202, jobId: null };
    if (row.course_state !== 'draft') return { error: 'This course has already been approved.', status: 409 };
    if (row.source_revision !== row.revision) return { error: 'Your source materials changed. Generate a fresh plan before approving.', status: 409 };
    if (row.plan_revision !== input.data.revision) return { error: 'This plan changed. Refresh and review the latest version before approving.', status: 409 };
    if (!row.plan) return { error: 'Generate a plan before approving it.', status: 409 };
    const parsed = planDraftSchema.safeParse(row.plan);
    if (!parsed.success) return { error: 'Fix the plan before approving it.', status: 409 };
    await client.query("UPDATE courses SET state='validating',timezone=$2,delivery_time=$3,updated_at=now() WHERE id=$1", [row.course_id, input.data.timezone, input.data.deliveryTime]);
    const jobId = await enqueueJob(client, 'approve', `approve:${row.course_id}:${row.plan_revision}`, row.course_id);
    return { status: 202, jobId };
  });
  response.status(result.status).json(result);
});

courseRouter.patch('/:id/settings', async (request, response) => {
  const input = z.object({ timezone: z.string().min(1).max(80).optional(), deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), paused: z.boolean().optional() }).safeParse(request.body);
  if (!input.success || (input.data.timezone && !isSupportedTimeZone(input.data.timezone))) {
    response.status(400).json({ error: 'Choose a supported time zone and local delivery time.' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const row = await client.query(
      'SELECT c.* FROM courses c JOIN knowledge_bases k ON k.id=c.knowledge_base_id WHERE k.id=$1 AND k.owner_id=$2 FOR UPDATE OF c',
      [kbId(request), ownerId(request)],
    );
    if (!row.rowCount) return { error: 'Knowledge base not found.', status: 404 };
    const course = row.rows[0] as { id: string; state: string; timezone: string | null; delivery_time: string | null; next_due_at: Date | null; last_published_at: Date | null; plan: { lessons: unknown[] } };
    if (!['active', 'paused'].includes(course.state)) return { error: 'Approve the learning plan before changing course settings.', status: 409 };
    const timezone = input.data.timezone || course.timezone || 'UTC';
    const deliveryTime = input.data.deliveryTime || course.delivery_time || '08:00';
    const pausing = input.data.paused === true;
    const resuming = input.data.paused === false;
    let state = course.state;
    let due = course.next_due_at;
    if (pausing) state = 'paused';
    if (resuming) {
      state = 'active';
      const lastWasToday = course.last_published_at && localDateAt(course.last_published_at, timezone) === localDateAt(new Date(), timezone);
      due = lastWasToday ? nextLocalSlot({ after: new Date(), timezone, deliveryTime }) : new Date();
    }
    if ((input.data.timezone || input.data.deliveryTime) && !resuming && course.last_published_at) {
      due = nextLocalSlot({ after: new Date(Math.max(Date.now(), course.last_published_at.getTime() + 24 * 60 * 60 * 1000)), timezone, deliveryTime });
    }
    await client.query('UPDATE courses SET state=$2,timezone=$3,delivery_time=$4,next_due_at=$5,updated_at=now() WHERE id=$1', [course.id, state, timezone, deliveryTime, due]);
    return { status: 200, state, nextDueAt: due };
  });
  response.status(result.status).json(result);
});

courseRouter.post('/:id/retry', async (request, response) => {
  const result = await withTransaction(async (client) => {
    const found = await client.query(
      `SELECT c.id,c.state,e.id AS episode_id,e.lesson_index,j.id AS job_id,j.kind,j.job_key
       FROM knowledge_bases k JOIN courses c ON c.knowledge_base_id=k.id
       LEFT JOIN LATERAL (SELECT * FROM episodes WHERE course_id=c.id AND state='failed' ORDER BY lesson_index DESC LIMIT 1) e ON true
       LEFT JOIN LATERAL (SELECT * FROM jobs WHERE entity_id=e.id AND status='failed' ORDER BY created_at DESC LIMIT 1) j ON true
       WHERE k.id=$1 AND k.owner_id=$2 FOR UPDATE OF c`,
      [kbId(request), ownerId(request)],
    );
    const row = found.rows[0] as { state: string; job_id?: string; kind?: string; job_key?: string; episode_id?: string } | undefined;
    if (!row) return { error: 'Knowledge base not found.', status: 404 };
    if (!row.job_id || !row.kind || !row.job_key || !row.episode_id) return { error: 'There is no failed episode to retry.', status: 409 };
    const nextKind = row.kind === 'script' ? 'script' : 'audio';
    await client.query("UPDATE episodes SET state='pending',error_message=NULL WHERE id=$1", [row.episode_id]);
    await client.query("UPDATE jobs SET status='pending',attempts=0,available_at=now(),error_message=NULL,lease_token=NULL,lease_expires_at=NULL WHERE id=$1", [row.job_id]);
    return { status: 202, jobId: row.job_id, stage: nextKind };
  });
  response.status(result.status).json(result);
});

export function nextEpisodeDue(now: Date, timezone: string, deliveryTime: string): Date {
  return nextLocalSlot({ after: now, timezone, deliveryTime });
}
