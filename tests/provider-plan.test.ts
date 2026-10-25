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
  const invalidExcerpt = 'Rust ownership moves each value to one owner. '.repeat(8);
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
