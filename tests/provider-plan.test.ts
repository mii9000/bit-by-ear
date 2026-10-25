import { afterEach, expect, it, vi } from 'vitest';
import { generatePlan } from '../src/server/providers.js';

vi.mock('../src/server/config.js', () => ({
  config: { providerMode: 'real', openRouterKey: 'test-key', openRouterModel: 'z-ai/glm-5.3-flash', appOrigin: 'http://localhost:5173' },
}));

afterEach(() => vi.unstubAllGlobals());

it('gives the correction call the source text needed to repair invalid quotes', async () => {
  const resourceId = '00000000-0000-4000-8000-000000000001';
  const source = 'Rust ownership moves each value to one owner. Borrowing lets a function use a value without taking ownership.';
  const resource = { id: resourceId, filename: 'rust.md', mediaType: 'text/markdown', text: source, pages: [] };
  const validExcerpt = 'Rust ownership moves each value to one owner.';
  // Invented wording: no verbatim prefix exists in the source, so only the model can repair it.
  const invalidExcerpt = 'Ownership transfers every value between owners. '.repeat(8);
  const plan = (excerpt: string) => ({
    title: 'Rust ownership',
    rationale: 'Build a short series from the supplied Rust notes.',
    materialGaps: [],
    lessons: Array.from({ length: 3 }, (_, index) => ({
      title: `Lesson ${index + 1}`,
      objective: 'Explain ownership using the supplied Rust notes.',
      sourceRefs: [{ resourceId, page: null, excerpt }],
    })),
  });
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
    calls += 1;
    const request = JSON.parse(options.body as string);
    const input = JSON.parse(request.messages[1].content);
    const excerpt = calls === 2 && input.resources?.[0]?.text === source ? validExcerpt : invalidExcerpt;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan(excerpt)) } }] }), { status: 200 });
  }));

  const result = await generatePlan({ learner: { topic: 'Rust', goal: 'Understand ownership', currentKnowledge: 'New to Rust' }, resources: [resource] });

  expect(calls).toBe(2);
  expect(result.draft.lessons[0]?.sourceRefs[0]?.excerpt).toBe(validExcerpt);
});

it('recognizes a truncated model response as truncation, not invalid JSON', async () => {
  const resourceId = '00000000-0000-4000-8000-000000000001';
  const resource = { id: resourceId, filename: 'rust.md', mediaType: 'text/markdown', text: 'Rust ownership moves each value to one owner.', pages: [] };
  const truncatedPlan = '{"title": "Rust", "rationale": "A short series.", "materialGaps": [], "lessons": [{"title": "Lesson 1", "objective": "Expl';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: truncatedPlan } }] }),
    { status: 200 },
  )));

  let error: Error | undefined;
  try { await generatePlan({ learner: { topic: 'Rust', goal: 'Understand ownership', currentKnowledge: 'New to Rust' }, resources: [resource] }); }
  catch (value) { error = value as Error; }

  expect(error).toBeInstanceOf(Error);
  expect(error!.message).toMatch(/truncated|cut off|space/i);
  expect(error!.message).not.toMatch(/invalid JSON/i);
});

it('clamps an over-long verbatim excerpt to a matching quote instead of failing validation', async () => {
  const resourceId = '00000000-0000-4000-8000-000000000001';
  const sentence = 'Rust ownership moves each value to one owner. ';
  const source = sentence.repeat(12);
  const longExcerpt = sentence.repeat(9).trim(); // 413 chars: verbatim in source, over the 300-char limit
  const resource = { id: resourceId, filename: 'rust.md', mediaType: 'text/markdown', text: source, pages: [] };
  const plan = {
    title: 'Rust ownership',
    rationale: 'Build a short series from the supplied Rust notes.',
    materialGaps: [],
    lessons: Array.from({ length: 3 }, (_, index) => ({
      title: `Lesson ${index + 1}`,
      objective: 'Explain ownership using the supplied Rust notes.',
      sourceRefs: [{ resourceId, page: null, excerpt: index === 0 ? longExcerpt : sentence.trim() }],
    })),
  };
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 }); }));

  const result = await generatePlan({ learner: { topic: 'Rust', goal: 'Understand ownership', currentKnowledge: 'New to Rust' }, resources: [resource] });

  const excerpt = result.draft.lessons[0]!.sourceRefs[0]!.excerpt;
  expect(calls).toBe(1);
  expect(excerpt.length).toBeLessThanOrEqual(300);
  expect(source.includes(excerpt)).toBe(true);
});

it('keeps correcting paraphrased excerpts until they match, like episode scripts do', async () => {
  const resourceId = '00000000-0000-4000-8000-000000000001';
  const source = 'Rust ownership moves each value to one owner. Borrowing lets a function use a value without taking ownership.';
  const resource = { id: resourceId, filename: 'rust.md', mediaType: 'text/markdown', text: source, pages: [] };
  const plan = (excerpt: string) => ({
    title: 'Rust ownership',
    rationale: 'Build a short series from the supplied Rust notes.',
    materialGaps: [],
    lessons: Array.from({ length: 3 }, (_, index) => ({
      title: `Lesson ${index + 1}`,
      objective: 'Explain ownership using the supplied Rust notes.',
      sourceRefs: [{ resourceId, page: null, excerpt }],
    })),
  });
  const paraphrased = 'Ownership transfers every value between owners.';
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    calls += 1;
    const excerpt = calls >= 3 ? source.split('.')[0]! + '.' : paraphrased; // correction keeps failing until the third attempt
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan(excerpt)) } }] }), { status: 200 });
  }));

  const result = await generatePlan({ learner: { topic: 'Rust', goal: 'Understand ownership', currentKnowledge: 'New to Rust' }, resources: [resource] });

  expect(calls).toBe(3);
  expect(source.includes(result.draft.lessons[0]!.sourceRefs[0]!.excerpt)).toBe(true);
});

it('repairs a drifted excerpt by substituting the verbatim source span, without another model call', async () => {
  const resourceId = '00000000-0000-4000-8000-000000000001';
  const source = 'Rust ownership moves each value to one owner. Borrowing lets a function use a value without taking ownership.';
  const resource = { id: resourceId, filename: 'rust.md', mediaType: 'text/markdown', text: source, pages: [] };
  const drifted = 'Rust ownership shifts each value to one owner. Borrowing'; // one word changed mid-quote
  const plan = {
    title: 'Rust ownership',
    rationale: 'Build a short series from the supplied Rust notes.',
    materialGaps: [],
    lessons: Array.from({ length: 3 }, (_, index) => ({
      title: `Lesson ${index + 1}`,
      objective: 'Explain ownership using the supplied Rust notes.',
      sourceRefs: [{ resourceId, page: null, excerpt: index === 0 ? drifted : 'Borrowing lets a function use a value' }],
    })),
  };
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 }); }));

  const result = await generatePlan({ learner: { topic: 'Rust', goal: 'Understand ownership', currentKnowledge: 'New to Rust' }, resources: [resource] });

  const excerpt = result.draft.lessons[0]!.sourceRefs[0]!.excerpt;
  expect(calls).toBe(1);
  expect(excerpt).not.toBe(drifted);
  expect(source.includes(excerpt)).toBe(true);
});
