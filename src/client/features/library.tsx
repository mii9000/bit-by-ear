import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, CirclePlus, Headphones, LoaderCircle, Plus, Sparkles, UploadCloud } from 'lucide-react';
import { api, post } from '../api.js';
import type { CourseState } from '../../shared/contracts.js';
import { knowledgeBaseSchema, type KnowledgeBaseInput } from './schemas.js';

type KnowledgeBaseSummary = {
  id: string; title: string; topic: string; goal: string; courseState: CourseState; resourceCount: number;
  nextEpisode: { id: string; title: string; state: string; lessonIndex: number } | null;
};

function NewKnowledgeBase({ onCreated }: { onCreated: (id: string) => void }) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<KnowledgeBaseInput>();
  const [error, setError] = useState('');
  const create = useMutation({ mutationFn: (data: KnowledgeBaseInput) => post<{ knowledgeBase: { id: string } }>('/api/knowledge-bases', data), onSuccess: ({ knowledgeBase }) => { reset(); onCreated(knowledgeBase.id); } });
  const submit = handleSubmit((values) => {
    setError('');
    const parsed = knowledgeBaseSchema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Check your learning details.'); return; }
    create.mutate(parsed.data);
  });

  return <form className="create-card" onSubmit={(event) => { void submit(event); }} noValidate>
    <div className="create-intro"><span className="icon-disc"><CirclePlus size={20} /></span><div><h2>Start with a curiosity</h2><p>What would you like to understand a little better?</p></div></div>
    <div className="form-grid">
      <label>Give it a name<input placeholder="My first course" {...register('title')} /></label>
      <label>What topic?<input placeholder="e.g. Climate systems" {...register('topic')} /></label>
      <label className="wide">What would you like to learn?<textarea rows={2} placeholder="Describe what you want to be able to explain or understand." {...register('goal')} /></label>
      <label className="wide">What do you already know?<textarea rows={2} placeholder="A sentence or two helps make your lessons feel right for you." {...register('currentKnowledge')} /></label>
    </div>
    {(Object.keys(errors).length > 0 || error || create.error) && <p className="notice error" role="alert">{error || create.error?.message || 'Fill in each field to get started.'}</p>}
    <div className="form-end"><span className="subtle">Start with one topic. You can add your own resources next.</span><button className="button primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create knowledge base'} <Plus size={16} /></button></div>
  </form>;
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({ queryKey: ['knowledge-bases'], queryFn: () => api<{ knowledgeBases: KnowledgeBaseSummary[] }>('/api/knowledge-bases') });
  const [showCreate, setShowCreate] = useState(false);
  const cards = useMemo(() => data?.knowledgeBases ?? [], [data]);

  if (isPending) return <div className="loading"><LoaderCircle className="spin" /> Setting up your learning space…</div>;
  if (error) return <p className="notice error" role="alert">{error.message}</p>;
  return <main className="page-shell">
    <section className="hero-row">
      <div><p className="eyebrow">Your listening library</p><h1>A little learning,<br className="small-break" /> a little at a time.</h1><p className="intro-copy">Build an audio course from the material you already have.</p></div>
      {cards.length > 0 && <button className="button primary" onClick={() => setShowCreate((value) => !value)}><Plus size={17} /> New knowledge base</button>}
    </section>

    {cards.length === 0 || showCreate ? <NewKnowledgeBase onCreated={(id) => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      navigate(`/knowledge/${id}`);
    }} /> : <section className="library-section" aria-label="Your knowledge bases">
      <div className="section-heading"><div><span className="eyebrow">In progress</span><h2>Your knowledge bases</h2></div><span className="count-pill">{cards.length} {cards.length === 1 ? 'topic' : 'topics'}</span></div>
      <div className="knowledge-grid">{cards.map((card) => <Link className="knowledge-card" key={card.id} to={`/knowledge/${card.id}`}>
        <div className="card-top"><span className="icon-disc"><BookOpen size={19} /></span><StatusPill state={card.courseState} /></div>
        <p className="eyebrow card-topic">{card.topic}</p><h3>{card.title}</h3><p className="card-goal">{card.goal}</p>
        <div className="card-foot"><span><UploadCloud size={15} /> {card.resourceCount} {card.resourceCount === 1 ? 'resource' : 'resources'}</span>
          {card.nextEpisode ? <span><Headphones size={15} /> {card.nextEpisode.state === 'ready' ? 'Ready to listen' : 'Episode preparing'}</span> : <span><Sparkles size={15} /> Build your plan</span>}
        </div>
      </Link>)}</div>
      {cards.length >= 3 && <p className="subtle bottom-note">You’ve reached the current early access limit of 3 knowledge bases.</p>}
    </section>}
  </main>;
}

export function StatusPill({ state }: { state: string }) {
  const labels: Record<string, string> = { draft: 'Planning', validating: 'Checking plan', active: 'Learning', paused: 'Paused', completed: 'Complete', pending: 'Processing', generating: 'Preparing', failed: 'Needs attention', ready: 'Ready' };
  return <span className={`status-pill ${state}`}>{state === 'generating' || state === 'pending' ? <span className="status-dot loading-dot" /> : <span className="status-dot" />}{labels[state] || state}</span>;
}
