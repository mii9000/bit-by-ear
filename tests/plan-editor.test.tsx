// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { CoursePage } from '../src/client/features/course.js';

const { data } = vi.hoisted(() => ({ data: {
  course: {
    id: 'knowledge-base-id', state: 'draft', revision: 1, title: 'Forest ecology', topic: 'Forests', goal: 'Understand a forest.',
    episodes: [], planJob: null, plan: {
      title: 'Forest ecology', rationale: 'Build understanding gradually.', materialGaps: [],
      lessons: Array.from({ length: 3 }, (_, index) => ({ title: `Episode ${index + 1}`, objective: 'Explain one forest relationship.', sourceRefs: [] })),
    },
  },
  resources: [],
} }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

it('keeps focus and the same input element while an episode title is edited', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<MemoryRouter><CoursePage /></MemoryRouter>); });
    const input = container.querySelector<HTMLInputElement>('#title-0')!;
    input.focus();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Episode 1a');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.querySelector('#title-0')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Episode 1a');
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  }
});
