import { describe, expect, it } from 'vitest';
import { isPublishableDuration, measureDurationFromMp3, narrationWordTarget } from '../src/shared/audio.js';
import { validatePlanDraft } from '../src/shared/plan.js';
import { episodeScriptIssue } from '../src/server/providers.js';

describe('episode duration', () => {
  it('allows measured audio through the 120 second limit only', () => {
    expect(isPublishableDuration(119.9)).toBe(true);
    expect(isPublishableDuration(120)).toBe(true);
    expect(isPublishableDuration(120.1)).toBe(false);
    expect(isPublishableDuration(0)).toBe(false);
    expect(isPublishableDuration(Number.NaN)).toBe(false);
    expect(isPublishableDuration(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('measures MPEG audio duration rather than estimating from script length', async () => {
    const mpeg1Layer3Header = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
    const frame = Buffer.concat([mpeg1Layer3Header, Buffer.alloc(413)]);
    const parsed = await measureDurationFromMp3(Buffer.concat(Array.from({ length: 6 }, () => frame)));
    expect(parsed).toBeGreaterThan(0);
  });

  it('targets short narration so the measured audio can fit under two minutes', () => {
    expect(narrationWordTarget).toEqual({ min: 180, max: 220 });
  });
});

describe('learning plan validation', () => {
  it('accepts three through thirty properly referenced lessons', () => {
    const draft = {
      title: 'Distributed systems',
      rationale: 'Build up from the material in the notes.',
      materialGaps: [],
      lessons: Array.from({ length: 3 }, (_, index) => ({
        title: `Lesson ${index + 1}`,
        objective: 'Explain the idea in the supplied notes.',
        sourceRefs: [{ resourceId: '00000000-0000-4000-8000-000000000001', page: 1, excerpt: 'consistency across replicas' }],
      })),
    };

    expect(validatePlanDraft(draft, new Map([['00000000-0000-4000-8000-000000000001', ['consistency across replicas']]])).success).toBe(true);
  });

  it('rejects fabricated resource references, invalid lesson counts, and questions', () => {
    const draft = {
      title: 'Topic',
      rationale: 'rationale',
      materialGaps: [],
      lessons: Array.from({ length: 2 }, () => ({
        title: 'Lesson',
        objective: 'What will the learner explain?',
        sourceRefs: [{ resourceId: '00000000-0000-4000-8000-000000000002', page: null, excerpt: 'missing quote' }],
      })),
    };

    expect(validatePlanDraft(draft, new Map()).success).toBe(false);
  });
});

describe('episode narration validation', () => {
  const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');

  it('accepts the full inclusive word range and reports short or long scripts precisely', () => {
    expect(episodeScriptIssue(words(180))).toBeNull();
    expect(episodeScriptIssue(words(220))).toBeNull();
    expect(episodeScriptIssue(words(179))).toContain('179 words');
    expect(episodeScriptIssue(words(221))).toContain('221 words');
  });

  it('rejects direct questions separately from word-count issues', () => {
    expect(episodeScriptIssue(`${words(200)}?`)).toContain('question mark');
  });
});
