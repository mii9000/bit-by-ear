import { createRequire } from 'node:module';
import type { PoolClient } from 'pg';

const require = createRequire(import.meta.url);
const maxResourceBytes = 5 * 1024 * 1024;
const maxKnowledgeText = 60_000;
const maxResources = 10;
const maxPdfPages = 100;

export type ExtractedResource = { id: string; filename: string; mediaType: string; text: string; pages: { page: number; text: string }[] };

export function isSupportedResource(mediaType: string, filename: string): boolean {
  const extension = filename.toLowerCase().split('.').pop();
  return (mediaType === 'application/pdf' && extension === 'pdf') || extension === 'md' || extension === 'markdown' || extension === 'txt';
}

export async function extractResource(bytes: Buffer, mediaType: string): Promise<{ text: string; pages: { page: number; text: string }[] }> {
  if (mediaType === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
    if (document.numPages > maxPdfPages) throw new Error(`PDFs are limited to ${maxPdfPages} pages.`);
    const pages: { page: number; text: string }[] = [];
    for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
      const page = await document.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim();
      if (text) pages.push({ page: pageNo, text });
    }
    const text = pages.map((page) => page.text).join('\n\n').trim();
    if (text.length < 20) throw new Error('This PDF has no selectable text. Upload a text PDF, Markdown, or .txt file.');
    return { text, pages };
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  if (!text) throw new Error('This file is empty.');
  return { text, pages: [] };
}

export async function queueResource(client: PoolClient, input: { knowledgeBaseId: string; filename: string; mediaType: string; bytes: Buffer }): Promise<string> {
  if (input.bytes.length > maxResourceBytes) throw Object.assign(new Error('Each file must be smaller than 5 MB.'), { status: 413 });
  if (!isSupportedResource(input.mediaType, input.filename)) throw Object.assign(new Error('Upload a text PDF, Markdown, or plain text file.'), { status: 400 });

  const kb = await client.query(
    'SELECT id FROM knowledge_bases WHERE id = $1 AND revision > 0 FOR UPDATE',
    [input.knowledgeBaseId],
  );
  if (!kb.rowCount) throw Object.assign(new Error('Knowledge base not found.'), { status: 404 });
  const course = await client.query('SELECT state FROM courses WHERE knowledge_base_id = $1 FOR UPDATE', [input.knowledgeBaseId]);
  if (course.rows[0]?.state !== 'draft') throw Object.assign(new Error('Resources are locked after learning plan approval.'), { status: 409 });
  const total = await client.query<{ count: string; bytes: string }>(
    'SELECT count(*)::text, COALESCE(sum(byte_count), 0)::text FROM resources WHERE knowledge_base_id = $1',
    [input.knowledgeBaseId],
  );
  if (Number(total.rows[0]?.count) >= maxResources) throw Object.assign(new Error('Each knowledge base can hold up to 10 resources.'), { status: 400 });
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO resources(knowledge_base_id, filename, media_type, original_bytes, byte_count, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
    [input.knowledgeBaseId, input.filename.slice(0, 200), input.mediaType, input.bytes, input.bytes.length],
  );
  const resourceId = inserted.rows[0]!.id;
  await client.query(
    `INSERT INTO jobs(kind, job_key, entity_id) VALUES ('extract', $1, $2)
     ON CONFLICT (job_key) DO NOTHING`,
    [`extract:${resourceId}`, resourceId],
  );
  await client.query('UPDATE knowledge_bases SET revision = revision + 1, updated_at = now() WHERE id = $1', [input.knowledgeBaseId]);
  return resourceId;
}

export { maxKnowledgeText, maxResourceBytes };
