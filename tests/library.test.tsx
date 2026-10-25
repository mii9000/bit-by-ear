import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LibraryPage } from '../src/client/features/library.js';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { knowledgeBases: [{
      id: 'knowledge-base-id', title: 'Rust v1', topic: 'Rust', goal: 'Understand ownership.',
      courseState: 'paused', resourceCount: 1, nextEpisode: null,
    }] },
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

it('shows a paused series accurately when all ready episodes have been listened to', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LibraryPage /></MemoryRouter>);

  expect(html).toContain('Generation paused');
  expect(html).not.toContain('Build your plan');
});
