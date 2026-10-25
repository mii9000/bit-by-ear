import { describe, expect, it } from 'vitest';
import { isSupportedResource } from '../src/server/resources.js';

describe('resource uploads', () => {
  it('accepts PDF, Markdown and plain text only', () => {
    expect(isSupportedResource('application/pdf', 'notes.pdf')).toBe(true);
    expect(isSupportedResource('text/markdown', 'notes.md')).toBe(true);
    expect(isSupportedResource('text/plain', 'notes.txt')).toBe(true);
    expect(isSupportedResource('text/csv', 'notes.csv')).toBe(false);
    expect(isSupportedResource('text/html', 'notes.html')).toBe(false);
    expect(isSupportedResource('application/octet-stream', 'notes.csv')).toBe(false);
  });
});
