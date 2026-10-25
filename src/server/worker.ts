import { setTimeout as sleep } from 'node:timers/promises';
import { fromZonedTime } from 'date-fns-tz';
import webpush from 'web-push';
import { config } from './config.js';
import { pool, withTransaction } from './db.js';
import { completeJob, claimJob, enqueueJob, failJob, type ClaimedJob } from './jobs.js';
import { extractResource, maxKnowledgeText, type ExtractedResource } from './resources.js';
import { generateEpisode, generatePlan, validateApproval, type LearnerContext } from './providers.js';
import { isPublishableDuration, maxEpisodeDurationSeconds, narrationWordTarget, measureDurationFromMp3 } from '../shared/audio.js';
import { planDraftSchema } from '../shared/plan.js';
import { narrate } from './audio.js';
import { localDateAt, nextLocalSlot } from './schedule.js';

type CourseContext = {
  id: string; course_id: string; course_state: string; title: string; topic: string; goal: string;
  current_knowledge: string; revision: number; source_revision: number; plan_revision: number;
  plan: unknown; approved_plan: unknown; timezone: string | null; delivery_time: string | null;
};

async function getResources(knowledgeBaseId: string): Promise<ExtractedResource[]> {
  const result = await pool.query(
    `SELECT id,filename,media_type,extracted_text,pages FROM resources WHERE knowledge_base_id=$1 AND status='ready' ORDER BY created_at`,
    [knowledgeBaseId],
  );
  return result.rows.map((row) => ({ id: row.id, filename: row.filename, mediaType: row.media_type, text: row.extracted_text, pages: row.pages }));
}

async function getCourse(id: string): Promise<CourseContext | undefined> {
  const result = await pool.query(
    `SELECT k.id,k.title,k.topic,k.goal,k.current_knowledge,k.revision,c.id AS course_id,c.state AS course_state,
            c.source_revision,c.plan_revision,c.plan,c.approved_plan,c.timezone,c.delivery_time
     FROM knowledge_bases k JOIN courses c ON c.knowledge_base_id=k.id WHERE k.id=$1`,
    [id],
  );
  return result.rows[0] as CourseContext | undefined;
}

function learner(course: CourseContext): LearnerContext {
  return { topic: course.topic, goal: course.goal, currentKnowledge: course.current_knowledge };
}

async function extractJob(job: ClaimedJob): Promise<void> {
  const resourceResult = await pool.query<{ id: string; knowledge_base_id: string; media_type: string; original_bytes: Buffer }>(
    'SELECT id,knowledge_base_id,media_type,original_bytes FROM resources WHERE id=$1', [job.entity_id],
  );
  const resource = resourceResult.rows[0];
  if (!resource) return;
  const extracted = await extractResource(resource.original_bytes, resource.media_type);
  await withTransaction(async (client) => {
    const locked = await client.query('SELECT id FROM knowledge_bases WHERE id=$1 FOR UPDATE', [resource.knowledge_base_id]);
    if (!locked.rowCount) return;
    const totals = await client.query<{ chars: string }>(
      "SELECT COALESCE(sum(length(extracted_text)),0)::text AS chars FROM resources WHERE knowledge_base_id=$1 AND id<>$2 AND status='ready'",
      [resource.knowledge_base_id, resource.id],
    );
    if (Number(totals.rows[0]?.chars || 0) + extracted.text.length > maxKnowledgeText) {
      await client.query("UPDATE resources SET status='failed',error_message='This resource exceeds the knowledge base 60,000 character limit. Remove it or shorten the file.' WHERE id=$1", [resource.id]);
      return;
    }
    await client.query("UPDATE resources SET extracted_text=$2,pages=$3,status='ready',error_message=NULL WHERE id=$1", [resource.id, extracted.text, JSON.stringify(extracted.pages)]);
    await client.query('UPDATE knowledge_bases SET updated_at=now() WHERE id=$1', [resource.knowledge_base_id]);
  });
}

async function planJob(job: ClaimedJob): Promise<void> {
  const course = await getCourse(job.entity_id);
  if (!course || course.course_state !== 'draft') return;
  const parts = job.job_key.split(':');
  const sourceRevision = Number(parts[2]);
  const requestedCount = parts[3] === 'proposed' ? undefined : Number(parts[3]);
  if (sourceRevision !== course.revision) return;
  const resources = await getResources(course.id);
  const result = await generatePlan({ learner: learner(course), resources, requestedCount });
  const valid = planDraftSchema.safeParse(result.draft);
  if (!valid.success) throw new Error('The learning plan did not match its expected format. Try generating it again.');
  await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE courses SET plan=$2::jsonb,source_revision=$3,plan_revision=plan_revision+1,updated_at=now()
       WHERE id=$1 AND state='draft' AND EXISTS (SELECT 1 FROM knowledge_bases WHERE id=$4 AND revision=$3) RETURNING id`,
      [course.course_id, JSON.stringify(valid.data), sourceRevision, course.id],
    );
    if (!updated.rowCount) return;
    await client.query("UPDATE jobs SET error_message=NULL WHERE job_key=$1", [job.job_key]);
  });
}

async function approveJob(job: ClaimedJob): Promise<void> {
  const result = await pool.query(
    `SELECT k.*,c.state AS course_state,c.plan,c.plan_revision,c.source_revision,c.timezone,c.delivery_time,c.id AS course_id
     FROM courses c JOIN knowledge_bases k ON k.id=c.knowledge_base_id WHERE c.id=$1`, [job.entity_id],
  );
  const course = result.rows[0] as CourseContext | undefined;
  if (!course || course.course_state !== 'validating') return;
  const plan = planDraftSchema.parse(course.plan);
  if (course.source_revision !== course.revision) throw new Error('The resources changed while the plan was checked. Generate a fresh plan.');
  const resources = await getResources(course.id);
  const checked = await validateApproval({ learner: learner(course), plan, resources });
  if (!checked.valid) {
    await withTransaction(async (client) => {
      await client.query("UPDATE courses SET state='draft',updated_at=now() WHERE id=$1 AND state='validating'", [course.course_id]);
      const updated = { ...plan, materialGaps: [...new Set([...plan.materialGaps, ...checked.gaps])].slice(0, 20) };
      await client.query('UPDATE courses SET plan=$2,plan_revision=plan_revision+1 WHERE id=$1', [course.course_id, updated]);
    });
    return;
  }
  await withTransaction(async (client) => {
    const locked = await client.query('SELECT state,source_revision,plan_revision FROM courses WHERE id=$1 FOR UPDATE', [course.course_id]);
    if (locked.rows[0]?.state !== 'validating' || locked.rows[0]?.source_revision !== course.source_revision || locked.rows[0]?.plan_revision !== course.plan_revision) return;
    await client.query("UPDATE courses SET state='active',approved_plan=$2,next_due_at=NULL,updated_at=now() WHERE id=$1", [course.course_id, JSON.stringify(plan)]);
    const episode = await client.query(
      `INSERT INTO episodes(course_id,lesson_index,state,title) VALUES ($1,1,'pending',$2) ON CONFLICT(course_id,lesson_index) DO UPDATE SET state='pending' RETURNING id`,
      [course.course_id, plan.lessons[0]!.title],
    );
    await enqueueJob(client, 'script', `script:${episode.rows[0]!.id}`, episode.rows[0]!.id);
  });
}

async function scriptJob(job: ClaimedJob): Promise<void> {
  const result = await pool.query(
    `SELECT e.id,e.lesson_index,c.approved_plan,k.topic,k.goal,k.current_knowledge,k.id AS knowledge_base_id
     FROM episodes e JOIN courses c ON c.id=e.course_id JOIN knowledge_bases k ON k.id=c.knowledge_base_id WHERE e.id=$1`, [job.entity_id],
  );
  const row = result.rows[0] as { id: string; lesson_index: number; approved_plan: unknown; topic: string; goal: string; current_knowledge: string; knowledge_base_id: string } | undefined;
  if (!row) return;
  const plan = planDraftSchema.parse(row.approved_plan);
  const lesson = plan.lessons[row.lesson_index - 1];
  if (!lesson) throw new Error('This episode has no approved lesson.');
  const previousResult = await pool.query('SELECT title,script,continuity_summary AS "continuitySummary" FROM episodes WHERE course_id=(SELECT course_id FROM episodes WHERE id=$1) AND lesson_index=$2 AND state=\'ready\'', [row.id, row.lesson_index - 1]);
  const generated = await generateEpisode({
    learner: { topic: row.topic, goal: row.goal, currentKnowledge: row.current_knowledge },
    lesson, resources: await getResources(row.knowledge_base_id), previous: previousResult.rows[0] ?? null,
  });
  await withTransaction(async (client) => {
    const changed = await client.query(
      `UPDATE episodes SET script=$2,continuity_summary=$3,source_refs=$4,state='generating',error_message=NULL,title=$5
       WHERE id=$1 AND state <> 'ready' RETURNING id`,
      [row.id, generated.episode.script, generated.episode.continuitySummary, JSON.stringify(generated.episode.sourceRefs), generated.episode.title],
    );
    if (changed.rowCount) await enqueueJob(client, 'audio', `audio:${row.id}`, row.id);
  });
}

async function shortenEpisode(input: { episode: { title: string; script: string; continuitySummary: string; sourceRefs: unknown[] }; resources: ExtractedResource[]; lesson: { title: string; objective: string }; learner: LearnerContext }): Promise<{ title: string; script: string; continuitySummary: string; sourceRefs: unknown[] }> {
  if (config.providerMode === 'mock') {
    return { ...input.episode, script: input.episode.script.split(/\s+/).slice(0, narrationWordTarget.min - 4).join(' ') };
  }
  const result = await generateEpisode({ ...input, previous: { title: input.episode.title, script: input.episode.script, continuitySummary: input.episode.continuitySummary }, shorter: true });
  return result.episode;
}

async function audioJob(job: ClaimedJob): Promise<void> {
  const found = await pool.query(
    `SELECT e.id,e.script,e.title,e.continuity_summary AS "continuitySummary",e.source_refs AS "sourceRefs",
            e.duration_repair_attempted,e.lesson_index,c.approved_plan,k.id AS knowledge_base_id,k.topic,k.goal,k.current_knowledge
     FROM episodes e JOIN courses c ON c.id=e.course_id JOIN knowledge_bases k ON k.id=c.knowledge_base_id WHERE e.id=$1`, [job.entity_id],
  );
  const row = found.rows[0] as {
    id: string; script: string; title: string; continuitySummary: string; sourceRefs: unknown[]; duration_repair_attempted: boolean;
    lesson_index: number; approved_plan: unknown; knowledge_base_id: string; topic: string; goal: string; current_knowledge: string;
  } | undefined;
  if (!row?.script) return;
  const resources = await getResources(row.knowledge_base_id);
  const plan = planDraftSchema.parse(row.approved_plan);
  const lesson = plan.lessons[row.lesson_index - 1]!;
  let script = row.script;
  let summary = row.continuitySummary;
  let refs = row.sourceRefs;
  let audio = await narrate(script);
  if (audio.durationSeconds > maxEpisodeDurationSeconds) {
    if (row.duration_repair_attempted) throw new Error('This episode remains over two minutes after its one allowed repair. Try editing the plan or retrying later.');
    const shortened = await shortenEpisode({
      episode: { title: row.title, script, continuitySummary: summary, sourceRefs: refs },
      resources, lesson, learner: { topic: row.topic, goal: row.goal, currentKnowledge: row.current_knowledge },
    });
    script = shortened.script;
    summary = shortened.continuitySummary;
    refs = shortened.sourceRefs;
    await pool.query('UPDATE episodes SET script=$2,continuity_summary=$3,source_refs=$4,duration_repair_attempted=true WHERE id=$1', [row.id, script, summary, JSON.stringify(refs)]);
    audio = await narrate(script);
  }
  if (!isPublishableDuration(audio.durationSeconds)) throw new Error('The episode did not meet the 2 minute maximum. No audio was published.');
  await pool.query('UPDATE episodes SET audio_bytes=$2,duration_seconds=$3,state=\'generating\',error_message=NULL WHERE id=$1 AND state <> \'ready\'', [row.id, audio.bytes, audio.durationSeconds]);
  await publishEpisode(row.id, new Date());
}

export async function publishEpisode(episodeId: string, now: Date): Promise<boolean> {
  return withTransaction(async (client) => {
    const found = await client.query(
      `SELECT e.id,e.course_id,e.lesson_index,e.audio_bytes,e.duration_seconds,c.state,c.timezone,c.delivery_time,
              c.approved_plan,c.last_published_at,k.owner_id,k.id AS knowledge_base_id
       FROM episodes e JOIN courses c ON c.id=e.course_id JOIN knowledge_bases k ON k.id=c.knowledge_base_id
       WHERE e.id=$1 FOR UPDATE OF e,c`, [episodeId],
    );
    const row = found.rows[0] as { id: string; course_id: string; lesson_index: number; audio_bytes: Buffer | null; duration_seconds: number | null; state: string; timezone: string | null; delivery_time: string | null; approved_plan: unknown; last_published_at: Date | null; owner_id: string; knowledge_base_id: string } | undefined;
    if (!row || row.state !== 'active' || !row.audio_bytes || !isPublishableDuration(row.duration_seconds ?? Number.NaN)) return false;
    const plan = planDraftSchema.parse(row.approved_plan);
    const lessonCount = plan.lessons.length;
    const timezone = row.timezone || 'UTC';
    const localDate = localDateAt(now, timezone);
    const alreadyToday = await client.query(
      'SELECT id FROM courses WHERE id=$1 AND last_published_local_date=$2::date FOR UPDATE', [row.course_id, localDate],
    );
    if (alreadyToday.rowCount) return false;
    const ready = await client.query(
      `UPDATE episodes SET state='ready',ready_at=$2,error_message=NULL
       WHERE id=$1 AND state='generating' AND duration_seconds <= 120 RETURNING id`, [row.id, now],
    );
    if (!ready.rowCount) return false;
    const done = row.lesson_index >= lessonCount;
    const next = done ? null : nextLocalSlot({ after: now, timezone, deliveryTime: row.delivery_time || '08:00' });
    await client.query(
      `UPDATE courses SET next_due_at=$2,last_published_at=$3,last_published_local_date=$4,last_published_timezone=$5,
       state=CASE WHEN $6 THEN 'completed' ELSE state END,updated_at=$3 WHERE id=$1`,
      [row.course_id, next, now, localDate, timezone, done],
    );
    const subscriptions = await client.query('SELECT id FROM push_subscriptions WHERE user_id=$1', [row.owner_id]);
    for (const subscription of subscriptions.rows as { id: string }[]) {
      const delivery = await client.query<{ id: string }>(
        `INSERT INTO push_deliveries(episode_id,subscription_id) VALUES($1,$2)
         ON CONFLICT(episode_id,subscription_id) DO NOTHING RETURNING id`, [row.id, subscription.id],
      );
      if (delivery.rows[0]) await enqueueJob(client, 'push', `push:${delivery.rows[0].id}`, delivery.rows[0].id);
    }
    return true;
  });
}

export async function enqueueDueCourses(now: Date): Promise<number> {
  return withTransaction(async (client) => {
    const courses = await client.query(
      `SELECT c.id,c.approved_plan,c.timezone,c.delivery_time,c.last_published_local_date,e.id AS episode_id,e.audio_bytes,e.duration_seconds,
              COALESCE((SELECT max(lesson_index) FROM episodes WHERE course_id=c.id AND state='ready'),0) AS latest_ready
       FROM courses c LEFT JOIN LATERAL (SELECT * FROM episodes WHERE course_id=c.id AND state IN ('pending','generating','failed') ORDER BY lesson_index LIMIT 1) e ON true
       WHERE c.state='active' AND c.next_due_at <= $1 ORDER BY c.next_due_at LIMIT 20 FOR UPDATE OF c SKIP LOCKED`, [now],
    );
    let queued = 0;
    for (const course of courses.rows as { id: string; approved_plan: unknown; timezone: string | null; delivery_time: string | null; episode_id: string | null; audio_bytes: Buffer | null; duration_seconds: number | null; latest_ready: number; last_published_local_date: string | null }[]) {
      if (course.episode_id) {
        if (course.audio_bytes && isPublishableDuration(course.duration_seconds ?? 0)) {
          await client.query("UPDATE courses SET next_due_at=NULL WHERE id=$1", [course.id]);
          continue;
        }
        if (course.audio_bytes) continue;
        if (course.last_published_local_date === localDateAt(now, course.timezone || 'UTC')) continue;
      }
      const plan = planDraftSchema.parse(course.approved_plan);
      const index = Number(course.latest_ready) + 1;
      if (index > plan.lessons.length) {
        await client.query("UPDATE courses SET state='completed',next_due_at=NULL WHERE id=$1", [course.id]);
        continue;
      }
      let episodeId: string;
      if (course.episode_id) {
        episodeId = course.episode_id;
      } else {
        const episode = await client.query(
          `INSERT INTO episodes(course_id,lesson_index,state,title) VALUES($1,$2,'pending',$3)
           ON CONFLICT(course_id,lesson_index) DO UPDATE SET state=episodes.state RETURNING id`, [course.id, index, plan.lessons[index - 1]!.title],
        );
        episodeId = episode.rows[0]!.id;
      }
      await enqueueJob(client, 'script', `script:${episodeId}`, episodeId);
      await client.query('UPDATE courses SET next_due_at=NULL WHERE id=$1', [course.id]);
      queued += 1;
    }
    return queued;
  });
}

const pushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'push.services.mozilla.com']);

async function deliverPush(job: ClaimedJob): Promise<void> {
  if (!config.vapidPublic || !config.vapidPrivate) return;
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate);
  const result = await pool.query(
    `SELECT d.id,d.episode_id,s.id AS subscription_id,s.endpoint,s.subscription,e.title
     FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id JOIN episodes e ON e.id=d.episode_id
     WHERE d.id=$1 AND e.state='ready'`, [job.entity_id],
  );
  const row = result.rows[0] as { id: string; episode_id: string; subscription_id: string; endpoint: string; subscription: webpush.PushSubscription; title: string } | undefined;
  if (!row) return;
  const url = new URL(row.endpoint);
  if (url.protocol !== 'https:' || !pushHosts.has(url.hostname)) throw new Error('This browser uses an unsupported push service. You can still listen in the app.');
  try {
    await webpush.sendNotification(row.subscription, JSON.stringify({ title: 'Your next small step is ready', body: 'A new audio episode is waiting. Listen whenever you’re ready.', url: `/episodes/${row.episode_id}` }), { TTL: 3600, urgency: 'normal' });
    await pool.query('UPDATE push_deliveries SET delivered_at=now(),attempts=attempts+1 WHERE id=$1', [row.id]);
  } catch (error) {
    const code = (error as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await pool.query('DELETE FROM push_subscriptions WHERE id=$1', [row.subscription_id]);
    throw error;
  }
}

async function execute(job: ClaimedJob): Promise<void> {
  switch (job.kind) {
    case 'extract': await extractJob(job); break;
    case 'plan': await planJob(job); break;
    case 'approve': await approveJob(job); break;
    case 'script': await scriptJob(job); break;
    case 'audio': await audioJob(job); break;
    case 'push': await deliverPush(job); break;
  }
}

async function publishSavedEpisodes(now: Date): Promise<void> {
  const saved = await pool.query<{ id: string }>(
    `SELECT e.id FROM episodes e JOIN courses c ON c.id=e.course_id
     WHERE c.state='active' AND e.state='generating' AND e.audio_bytes IS NOT NULL
     ORDER BY e.updated_at LIMIT 20`,
  );
  for (const episode of saved.rows) await publishEpisode(episode.id, now);
}

export async function tick(now = new Date()): Promise<void> {
  await publishSavedEpisodes(now);
  await enqueueDueCourses(now);
  const job = await claimJob(now);
  if (!job) return;
  try {
    await execute(job);
    await completeJob(job);
  } catch (error) {
    console.error(JSON.stringify({ event: 'job_failed', jobId: job.id, kind: job.kind, attempt: job.attempts, message: (error instanceof Error ? error.message : 'failed').slice(0, 180) }));
    await failJob(job, error);
  }
}

export async function startWorker(): Promise<void> {
  console.log('Bit by Ear worker started.');
  while (true) {
    try { await tick(); }
    catch (error) { console.error(JSON.stringify({ event: 'worker_error', message: error instanceof Error ? error.message.slice(0, 180) : 'failed' })); }
    await sleep(config.isProduction ? 30_000 : 1_000);
  }
}

if (process.argv[1]?.endsWith('/worker.ts') || process.argv[1]?.endsWith('/worker.js')) {
  startWorker().catch((error) => { console.error(error); process.exit(1); });
}
