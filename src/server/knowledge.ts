import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { pool, withTransaction } from './db.js';
import { queueResource } from './resources.js';
import type { PoolClient } from 'pg';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const createKnowledgeBaseSchema = z.object({
  title: z.string().trim().min(2).max(80),
  topic: z.string().trim().min(2).max(120),
  goal: z.string().trim().min(8).max(500),
  currentKnowledge: z.string().trim().min(4).max(800),
});

export const knowledgeRouter = Router();

knowledgeRouter.get('/', async (request, response) => {
  const rows = await pool.query(
    `SELECT k.id, k.title, k.topic, k.goal, k.current_knowledge AS "currentKnowledge", k.revision,
            c.state AS "courseState", c.plan, c.timezone, c.delivery_time AS "deliveryTime", c.next_due_at AS "nextDueAt",
            (SELECT count(*)::int FROM resources r WHERE r.knowledge_base_id = k.id) AS "resourceCount",
            (SELECT jsonb_build_object('id', e.id, 'title', e.title, 'state', e.state, 'durationSeconds', e.duration_seconds,
              'progressSeconds', e.progress_seconds, 'lessonIndex', e.lesson_index)
             FROM episodes e WHERE e.course_id = c.id AND e.state = 'ready' AND NOT e.finished
             ORDER BY e.lesson_index LIMIT 1) AS "nextEpisode"
     FROM knowledge_bases k JOIN courses c ON c.knowledge_base_id = k.id
     WHERE k.owner_id = $1 ORDER BY k.updated_at DESC`,
    [request.user!.id],
  );
  response.json({ knowledgeBases: rows.rows });
});

knowledgeRouter.post('/', async (request, response) => {
  const input = createKnowledgeBaseSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: 'Add a name, topic, learning goal, and a little about what you already know.' });
    return;
  }
  const count = await pool.query<{ count: string }>('SELECT count(*) FROM knowledge_bases WHERE owner_id = $1', [request.user!.id]);
  if (Number(count.rows[0]?.count) >= 3) {
    response.status(400).json({ error: 'For this early access version, you can create up to 3 knowledge bases.' });
    return;
  }
  const knowledgeBase = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO knowledge_bases(owner_id, title, topic, goal, current_knowledge)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, title, topic, goal, current_knowledge AS "currentKnowledge", revision`,
      [request.user!.id, input.data.title, input.data.topic, input.data.goal, input.data.currentKnowledge],
    );
    const kb = result.rows[0] as { id: string; title: string };
    await client.query('INSERT INTO courses(knowledge_base_id) VALUES ($1)', [kb.id]);
    return result.rows[0];
  });
  response.status(201).json({ knowledgeBase });
});

knowledgeRouter.patch('/:id', async (request, response) => {
  const input = createKnowledgeBaseSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: 'Check the knowledge base name, topic, goal, and current knowledge.' });
    return;
  }
  const result = await withTransaction(async (client) => {
    const kb = await client.query('SELECT id FROM knowledge_bases WHERE id = $1 AND owner_id = $2 FOR UPDATE', [request.params.id, request.user!.id]);
    if (!kb.rowCount) return null;
    const course = await client.query('SELECT state FROM courses WHERE knowledge_base_id = $1 FOR UPDATE', [request.params.id]);
    if (course.rows[0]?.state !== 'draft') throw Object.assign(new Error('Learning details are locked after learning plan approval.'), { status: 409 });
    const update = await client.query(
      `UPDATE knowledge_bases SET title=$3, topic=$4, goal=$5, current_knowledge=$6, revision=revision+1, updated_at=now()
       WHERE id=$1 AND owner_id=$2 RETURNING id, title, topic, goal, current_knowledge AS "currentKnowledge", revision`,
      [request.params.id, request.user!.id, input.data.title, input.data.topic, input.data.goal, input.data.currentKnowledge],
    );
    return update.rows[0];
  });
  if (!result) {
    response.status(404).json({ error: 'Knowledge base not found.' });
    return;
  }
  response.json({ knowledgeBase: result });
});

knowledgeRouter.delete('/:id', async (request, response) => {
  const result = await pool.query('DELETE FROM knowledge_bases WHERE id = $1 AND owner_id = $2', [request.params.id, request.user!.id]);
  if (!result.rowCount) {
    response.status(404).json({ error: 'Knowledge base not found.' });
    return;
  }
  response.status(204).end();
});

knowledgeRouter.get('/:id/resources', async (request, response) => {
  const result = await pool.query(
    `SELECT r.id,r.filename,r.media_type AS "mediaType",r.byte_count AS "byteCount",r.status,r.error_message AS error,
            length(r.extracted_text)::int AS "characters",r.created_at AS "createdAt"
     FROM resources r JOIN knowledge_bases k ON k.id = r.knowledge_base_id
     WHERE k.id = $1 AND k.owner_id = $2 ORDER BY r.created_at`,
    [request.params.id, request.user!.id],
  );
  if (!result.rowCount) {
    const owned = await pool.query('SELECT id FROM knowledge_bases WHERE id=$1 AND owner_id=$2', [request.params.id, request.user!.id]);
    if (!owned.rowCount) {
      response.status(404).json({ error: 'Knowledge base not found.' });
      return;
    }
  }
  response.json({ resources: result.rows });
});

knowledgeRouter.post('/:id/resources', upload.single('file'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'Choose a resource file first.' });
    return;
  }
  try {
    const resourceId = await withTransaction((client) => queueResource(client, {
      knowledgeBaseId: String(request.params.id),
      filename: request.file!.originalname,
      mediaType: request.file!.mimetype,
      bytes: request.file!.buffer,
    }));
    response.status(202).json({ resourceId });
  } catch (error) {
    response.status((error as { status?: number }).status || 400).json({ error: (error as Error).message });
  }
});

knowledgeRouter.delete('/resources/:resourceId', async (request, response) => {
  const removed = await withTransaction(async (client) => {
    const result = await client.query<{ knowledge_base_id: string }>(
      `DELETE FROM resources r USING knowledge_bases k, courses c
       WHERE r.id = $1 AND k.id = r.knowledge_base_id AND k.owner_id = $2 AND c.knowledge_base_id = k.id AND c.state='draft'
       RETURNING r.knowledge_base_id`,
      [request.params.resourceId, request.user!.id],
    );
    if (result.rowCount) {
      await client.query('UPDATE knowledge_bases SET revision=revision+1, updated_at=now() WHERE owner_id=$1 AND id=$2', [request.user!.id, result.rows[0]!.knowledge_base_id]);
    }
    return Boolean(result.rowCount);
  });
  if (!removed) {
    response.status(404).json({ error: 'Resource not found or it belongs to an approved learning plan.' });
    return;
  }
  response.status(204).end();
});

export async function ownedKnowledgeBase(client: PoolClient, knowledgeBaseId: string, ownerId: string, lock = false) {
  return client.query(
    `SELECT k.*, c.id AS course_id, c.state AS course_state, c.plan, c.plan_revision, c.source_revision, c.approved_plan,
            c.timezone, c.delivery_time, c.next_due_at
     FROM knowledge_bases k JOIN courses c ON c.knowledge_base_id=k.id
     WHERE k.id=$1 AND k.owner_id=$2 ${lock ? 'FOR UPDATE OF k,c' : ''}`,
    [knowledgeBaseId, ownerId],
  );
}

export function sendResourceError(response: Response, error: unknown): void {
  response.status((error as { status?: number }).status || 500).json({ error: error instanceof Error ? error.message : 'Something went wrong.' });
}

export function userId(request: Request): string {
  return request.user!.id;
}
