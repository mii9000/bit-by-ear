export type Viewer = { id: string; email: string };
export type CourseState = 'draft' | 'validating' | 'active' | 'paused' | 'completed';
export type Resource = { id: string; filename: string; mediaType: string; status: 'pending' | 'ready' | 'failed'; error: string | null; characters: number | null };
export type Episode = { id: string; index: number; title: string; state: 'pending' | 'generating' | 'ready' | 'failed'; durationSeconds: number | null; progressSeconds: number; finished: boolean; error: string | null; readyAt: string | null };
