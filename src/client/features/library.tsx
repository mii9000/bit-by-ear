import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, CirclePlus, Headphones, LoaderCircle, Plus, Sparkles, UploadCloud, X } from 'lucide-react';
import { api, post } from '../api.js';
import type { CourseState } from '../../shared/contracts.js';
import { knowledgeBaseSchema, type KnowledgeBaseInput } from './schemas.js';

type KnowledgeBaseSummary = {
  id: string; title: string; topic: string; goal: string; courseState: CourseState; resourceCount: number;
  nextEpisode: { id: string; title: string; state: string; lessonIndex: number } | null;
};

function NewKnowledgeBase({ onCreated }: { onCreated: (id: string) => void }) {
  const { register, handleSubmit, setError: setFieldError, clearErrors, formState: { errors }, reset } = useForm<KnowledgeBaseInput>();
  const create = useMutation({ mutationFn: (data: KnowledgeBaseInput) => post<{ knowledgeBase: { id: string } }>('/api/knowledge-bases', data), onSuccess: ({ knowledgeBase }) => { reset(); onCreated(knowledgeBase.id); } });
  const submit = handleSubmit((values) => {
    clearErrors();
    const parsed = knowledgeBaseSchema.safeParse(values);
    if (!parsed.success) {
      for (const [index, issue] of parsed.error.issues.entries()) setFieldError(issue.path[0] as keyof KnowledgeBaseInput, { message: issue.message }, { shouldFocus: index === 0 });
      return;
    }
    create.mutate(parsed.data);
  });

  return <form id="new-knowledge-base" className="create-card" onSubmit={(event) => { void submit(event); }} noValidate>
    <div className="create-intro"><span className="icon-disc"><CirclePlus size={20} /></span><div><h2>What have you been meaning to learn?</h2><p>Choose a topic. We’ll help you explore it one idea at a time.</p></div></div>
    <div className="form-grid">
      <label>Give it a name<input required maxLength={80} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'title-error' : undefined} placeholder="Understanding climate systems" {...register('title')} />{errors.title && <span id="title-error" className="field-error">{errors.title.message}</span>}</label>
      <label>What topic?<input required maxLength={120} aria-invalid={Boolean(errors.topic)} aria-describedby={errors.topic ? 'topic-error' : undefined} placeholder="e.g. Climate systems" {...register('topic')} />{errors.topic && <span id="topic-error" className="field-error">{errors.topic.message}</span>}</label>
      <label className="wide">What would you like to learn?<textarea required maxLength={500} rows={3} aria-invalid={Boolean(errors.goal)} aria-describedby={errors.goal ? 'goal-error' : undefined} placeholder="Describe what you want to be able to explain or understand." {...register('goal')} />{errors.goal && <span id="goal-error" className="field-error">{errors.goal.message}</span>}</label>
      <label className="wide">What do you already know?<textarea required maxLength={800} rows={3} aria-invalid={Boolean(errors.currentKnowledge)} aria-describedby={errors.currentKnowledge ? 'knowledge-error' : undefined} placeholder="A sentence or two helps make your lessons feel right for you." {...register('currentKnowledge')} />{errors.currentKnowledge && <span id="knowledge-error" className="field-error">{errors.currentKnowledge.message}</span>}</label>
    </div>
    {(Object.keys(errors).length > 0 || create.error) && <p className="notice error" role="alert">{create.error?.message || 'Check the highlighted fields to continue.'}</p>}
    <div className="form-end"><span className="subtle">Start with one topic. You can add your own resources next.</span><button className="button primary" type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create knowledge base'} <Plus size={16} /></button></div>
  </form>;
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['knowledge-bases'], queryFn: () => api<{ knowledgeBases: KnowledgeBaseSummary[] }>('/api/knowledge-bases') });
  const [showCreate, setShowCreate] = useState(false);
  const cards = useMemo(() => data?.knowledgeBases ?? [], [data]);

  if (isPending) return <div className="loading"><LoaderCircle className="spin" /> Setting up your learning space…</div>;
  if (error) return <main className="page-shell"><h1>Your library couldn’t load</h1><p className="notice error" role="alert">{error.message}</p><button className="button primary" onClick={() => void refetch()}>Try again</button></main>;
  return <main className="page-shell">
    <section className="hero-row">
      <div><h1>Small listens.<br className="small-break" /> Steady learning.</h1><p className="intro-copy">Explore what interests you through short daily episodes, shaped around your own material.</p></div>
      {cards.length > 0 && <button className="button primary" aria-expanded={showCreate} aria-controls="new-knowledge-base" disabled={cards.length >= 3 && !showCreate} onClick={() => setShowCreate((value) => !value)}>{showCreate ? <X size={17} /> : <Plus size={17} />} {showCreate ? 'Cancel' : 'New knowledge base'}</button>}
    </section>

    {cards.length === 0 || showCreate ? <NewKnowledgeBase onCreated={(id) => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      navigate(`/knowledge/${id}`);
    }} /> : <section className="library-section" aria-label="Your knowledge bases">
      <div className="section-heading"><h2>Your knowledge bases</h2><span className="count-pill">{cards.length} {cards.length === 1 ? 'topic' : 'topics'}</span></div>
      <div className="knowledge-grid">{cards.map((card) => <Link className="knowledge-card" key={card.id} to={`/knowledge/${card.id}`}>
        <div className="card-top"><span className="icon-disc"><BookOpen size={19} /></span><StatusPill state={card.courseState} /></div>
        <h3>{card.title}</h3><p className="card-topic">{card.topic}</p><p className="card-goal">{card.goal}</p>
        <div className="card-foot"><span><UploadCloud size={15} /> {card.resourceCount} {card.resourceCount === 1 ? 'resource' : 'resources'}</span>
          {card.nextEpisode ? <span><Headphones size={15} /> Ready to listen</span> : <span><Sparkles size={15} /> {card.courseState === 'paused' ? 'Generation paused' : card.courseState === 'completed' ? 'Explore your episodes' : card.courseState === 'active' ? 'Next episode coming' : card.courseState === 'validating' ? 'Checking your plan' : 'Build your plan'}</span>}
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
