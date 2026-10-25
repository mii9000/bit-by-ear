import { Router } from 'express';
import { z } from 'zod';
import { pool } from './db.js';
import { readByteRange } from './audio.js';

export const episodeRouter = Router();

episodeRouter.get('/courses/:id/episodes', async (request, response) => {
  const owned = await pool.query(
    `SELECT e.id,e.lesson_index AS index,e.title,e.state,e.duration_seconds AS "durationSeconds",
            e.progress_seconds AS "progressSeconds",e.finished,e.error_message AS error,e.ready_at AS "readyAt"
     FROM episodes e JOIN courses c ON c.id=e.course_id JOIN knowledge_bases k ON k.id=c.knowledge_base_id
     WHERE c.knowledge_base_id=$1 AND k.owner_id=$2 ORDER BY e.lesson_index`,
    [request.params.id, request.user!.id],
  );
  const hasCourse = await pool.query('SELECT id FROM knowledge_bases WHERE id=$1 AND owner_id=$2', [request.params.id, request.user!.id]);
  if (!hasCourse.rowCount) {
    response.status(404).json({ error: 'Learning course not found.' });
    return;
  }
  response.json({ episodes: owned.rows });
});

episodeRouter.get('/episodes/:id', async (request, response) => {
  const result = await pool.query(
    `SELECT e.id,e.lesson_index AS index,e.title,e.state,e.script,e.source_refs AS "sourceRefs",
            e.duration_seconds AS "durationSeconds",e.progress_seconds AS "progressSeconds",e.finished,
            c.id AS "courseId",k.title AS "courseTitle"
     FROM episodes e JOIN courses c ON c.id=e.course_id JOIN knowledge_bases k ON k.id=c.knowledge_base_id
     WHERE e.id=$1 AND k.owner_id=$2 AND e.state='ready'`,
    [request.params.id, request.user!.id],
  );
  if (!result.rowCount) {
    response.status(404).json({ error: 'Audio episode not found.' });
    return;
  }
  response.setHeader('Cache-Control', 'private, no-store');
  response.json({ episode: result.rows[0] });
});

episodeRouter.get('/episodes/:id/audio', async (request, response) => {
  const result = await pool.query<{ audio_bytes: Buffer; duration_seconds: number }>(
    `SELECT e.audio_bytes,e.duration_seconds FROM episodes e JOIN courses c ON c.id=e.course_id
     JOIN knowledge_bases k ON k.id=c.knowledge_base_id WHERE e.id=$1 AND k.owner_id=$2 AND e.state='ready'`,
    [request.params.id, request.user!.id],
  );
  const row = result.rows[0];
  if (!row?.audio_bytes) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(404).json({ error: 'Audio episode not found.' });
    return;
  }
  const audio = row.audio_bytes;
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Type', 'audio/mpeg');
  response.setHeader('Accept-Ranges', 'bytes');
  const range = readByteRange(request.headers.range, audio.length);
  if (range === 'invalid') {
    response.setHeader('Content-Range', `bytes */${audio.length}`);
    response.status(416).end();
    return;
  }
  if (!range) {
    response.setHeader('Content-Length', audio.length);
    if (request.method === 'HEAD') response.status(200).end();
    else response.status(200).end(audio);
    return;
  }
  const { start, end } = range;
  response.status(206);
  response.setHeader('Content-Length', end - start + 1);
  response.setHeader('Content-Range', `bytes ${start}-${end}/${audio.length}`);
  response.end(request.method === 'HEAD' ? undefined : audio.subarray(start, end + 1));
});

episodeRouter.put('/episodes/:id/progress', saveProgress);
episodeRouter.post('/episodes/:id/progress', saveProgress);

async function saveProgress(request: { params: Record<string, string | undefined>; user?: { id: string }; body: unknown }, response: import('express').Response): Promise<void> {
  const input = z.object({ positionSeconds: z.number().finite().nonnegative().max(7_200), ended: z.boolean().optional() }).safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: 'Playback progress was invalid.' });
    return;
  }
  const result = await pool.query(
    `UPDATE episodes e SET progress_seconds=LEAST($3,e.duration_seconds),
       finished=e.finished OR COALESCE($4,false) OR ($3 >= e.duration_seconds-5),
       updated_at=now()
     FROM courses c JOIN knowledge_bases k ON k.id=c.knowledge_base_id
     WHERE e.course_id=c.id AND e.id=$1 AND e.state='ready' AND k.owner_id=$2
     RETURNING e.finished,e.progress_seconds AS "progressSeconds"`,
    [request.params.id, request.user!.id, input.data.positionSeconds, input.data.ended || false],
  );
  if (!result.rowCount) {
    response.status(404).json({ error: 'Audio episode not found.' });
    return;
  }
  response.json({ progress: result.rows[0] });
}
