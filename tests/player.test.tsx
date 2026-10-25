import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PlayerPage } from '../src/client/features/player.js';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      episode: {
        id: 'episode-id', index: 1, title: 'Rust fundamentals', state: 'ready',
        script: 'An introduction to Rust.', sourceRefs: [], durationSeconds: 82,
        progressSeconds: 0, finished: false, courseId: 'series-id',
        knowledgeBaseId: 'knowledge-base-id', courseTitle: 'Rust v1',
      },
    },
  }),
  useMutation: () => ({ mutate: vi.fn() }),
}));

it('links back to the knowledge base when its ID differs from the series ID', () => {
  const html = renderToStaticMarkup(<MemoryRouter><PlayerPage /></MemoryRouter>);

  expect(html).toContain('href="/knowledge/knowledge-base-id"');
  expect(html).not.toContain('href="/knowledge/series-id"');
});
