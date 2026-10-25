import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, ChevronRight, FileText, Headphones, LoaderCircle, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { api, post } from '../api.js';
import type { CourseState, Episode, Resource } from '../../shared/contracts.js';
import type { PlanDraft } from '../../shared/plan.js';
import { planDraftSchema } from '../../shared/plan.js';
import { StatusPill } from './library.js';

type CourseDetails = {
  id: string; courseId: string; title: string; topic: string; goal: string; currentKnowledge: string; sourceRevision: number; planSourceRevision: number;
  state: CourseState; plan: PlanDraft | null; approvedPlan: PlanDraft | null; revision: number; planJob: { status: string; error: string | null } | null;
  timezone: string | null; deliveryTime: string | null; nextDueAt: string | null; episodes: Episode[];
};
type CourseResponse = { course: CourseDetails; resources: Resource[] };

export function CoursePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [countChoice, setCountChoice] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const query = useQuery({
    queryKey: ['course', id], queryFn: () => api<CourseResponse>(`/api/courses/${id}`),
    refetchInterval: (state) => {
      const data = state.state.data as CourseResponse | undefined;
      return data?.course.state === 'validating' || data?.course.planJob?.status === 'pending' || data?.course.planJob?.status === 'running' || data?.resources.some((resource) => resource.status === 'pending') || data?.course.episodes.some((episode) => episode.state === 'pending' || episode.state === 'generating') ? 2000 : false;
    },
  });

  useEffect(() => {
    const course = query.data?.course;
    if (course?.plan && course.revision > 0 && course.revision !== draftRevision) {
      setDraft(course.plan);
      setDraftRevision(course.revision);
      setCountChoice(course.plan.lessons.length);
    }
  }, [query.data?.course.plan, query.data?.course.revision, draftRevision]);

  const changed = useMemo(() => Boolean(draft && query.data?.course.plan && JSON.stringify(draft) !== JSON.stringify(query.data.course.plan)), [draft, query.data?.course.plan]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['course', id] });
  const generate = useMutation({ mutationFn: (requestedCount?: number) => post<{ jobId: string }>(`/api/courses/${id}/plan/generate`, { requestedCount, requestId: crypto.randomUUID() }), onSuccess: () => { setDraft(null); setDraftRevision(null); void invalidate(); } });
  const savePlan = useMutation({ mutationFn: (plan: PlanDraft) => api<{ revision: number }>(`/api/courses/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ revision: query.data!.course.revision, plan }) }), onSuccess: async (response) => { setDraftRevision(response.revision); await invalidate(); } });
  const approve = useMutation({ mutationFn: async () => {
    const latest = await api<CourseResponse>(`/api/courses/${id}`);
    const reviewedPlan = draft || query.data?.course.plan;
    if (!latest.course.plan || !reviewedPlan || JSON.stringify(latest.course.plan) !== JSON.stringify(reviewedPlan)) {
      queryClient.setQueryData(['course', id], latest);
      throw new Error('The plan changed while this page was open. Review the latest plan before approving it.');
    }
    if (latest.course.planSourceRevision !== latest.course.sourceRevision) {
      throw new Error('Your source material changed after this plan was made. Generate a fresh plan before approving it.');
    }
    return post<{ jobId: string }>(`/api/courses/${id}/plan/approve`, {
      revision: latest.course.revision,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      deliveryTime: latest.course.deliveryTime || '08:00',
    });
  }, onSuccess: () => void invalidate() });
  const upload = useMutation({
    mutationFn: async (file: File) => { const body = new FormData(); body.append('file', file); return api<{ resourceId: string }>(`/api/knowledge-bases/${id}/resources`, { method: 'POST', body }); },
    onSuccess: () => { setUploadError(''); void invalidate(); void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] }); },
    onError: (error: Error) => setUploadError(error.message),
  });
  const removeResource = useMutation({ mutationFn: (resourceId: string) => api(`/api/knowledge-bases/resources/${resourceId}`, { method: 'DELETE' }), onSuccess: () => { setDraft(null); setDraftRevision(null); void invalidate(); } });
  const removeKnowledge = useMutation({ mutationFn: () => api(`/api/knowledge-bases/${id}`, { method: 'DELETE' }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] }); navigate('/'); } });

  if (query.isPending) return <div className="loading"><LoaderCircle className="spin" /> Opening your learning space…</div>;
  if (query.error || !query.data) return <main className="page-shell"><p className="notice error">{query.error?.message || 'This knowledge base could not be opened.'}</p><Link to="/" className="text-button">Back to your library</Link></main>;
  const { course, resources } = query.data;
  const readyResources = resources.filter((resource) => resource.status === 'ready');
  const pendingResources = resources.some((resource) => resource.status === 'pending');
  const planWorking = course.planJob?.status === 'pending' || course.planJob?.status === 'running';
  const planError = course.planJob?.status === 'failed' ? course.planJob.error : null;
  const courseActive = ['active', 'paused', 'completed'].includes(course.state);
  const plan = draft || course.plan;

  function changeLesson(index: number, update: (lesson: PlanDraft['lessons'][number]) => PlanDraft['lessons'][number]) {
    setDraft((current) => current ? { ...current, lessons: current.lessons.map((lesson, at) => at === index ? update(lesson) : lesson) } : null);
  }

  function moveLesson(index: number, offset: number) {
    if (!draft) return;
    const destination = index + offset;
    if (destination < 0 || destination >= draft.lessons.length) return;
    const lessons = [...draft.lessons];
    [lessons[index], lessons[destination]] = [lessons[destination]!, lessons[index]!];
    setDraft({ ...draft, lessons });
  }

  return <main className="page-shell course-shell">
    <Link className="back-link" to="/"><ArrowLeft size={16} /> Your library</Link>
    <section className="course-title-row">
      <div><p className="eyebrow">{course.topic}</p><h1>{course.title}</h1><p className="course-goal">{course.goal}</p></div>
      <StatusPill state={course.state} />
    </section>

    <section className="resource-panel">
      <div className="section-heading"><div><span className="eyebrow">Your source material</span><h2>Knowledge base</h2></div><span className="count-pill">{resources.length}/10</span></div>
      {resources.length > 0 && <ul className="resource-list">{resources.map((resource) => <li className="resource-row" key={resource.id}>
        <span className="file-icon"><FileText size={17} /></span><span className="file-name"><strong>{resource.filename}</strong><small>{resource.status === 'ready' ? `${resource.characters?.toLocaleString()} characters · ready to use` : resource.status === 'failed' ? resource.error : 'Preparing your resource…'}</small></span>
        <StatusPill state={resource.status} />
        {!courseActive && <button className="icon-button subtle-button" aria-label={`Remove ${resource.filename}`} onClick={() => removeResource.mutate(resource.id)}><Trash2 size={16} /></button>}
      </li>)}</ul>}
      {!courseActive && resources.length < 10 && <label className={`upload-drop ${upload.isPending ? 'busy' : ''}`}>
        <input type="file" accept=".pdf,.md,.markdown,.txt,text/plain,text/markdown,application/pdf" disabled={upload.isPending} onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) upload.mutate(file);
          event.currentTarget.value = '';
        }} />
        <span className="upload-symbol">{upload.isPending ? <LoaderCircle className="spin" size={19} /> : <UploadCloud size={20} />}</span>
        <span><strong>{upload.isPending ? 'Preparing your file…' : 'Add a resource'}</strong><small>PDF, Markdown, or text · up to 5 MB each</small></span><Plus size={17} className="upload-plus" />
      </label>}
      {uploadError && <p className="notice error" role="alert">{uploadError}</p>}
      {resources.length === 0 && <div className="empty-resources"><Sparkles size={19} /><p>Add a document or a note, and we’ll shape a short course around it.</p></div>}
    </section>

    {!courseActive && <section className="plan-section">
      <div className="section-heading plan-heading"><div><span className="eyebrow">Made for you</span><h2>{plan ? 'Your learning path' : 'Your plan comes next'}</h2></div>{plan && <span className="count-pill">{plan.lessons.length} days</span>}</div>
      {!plan && !planWorking && <div className="plan-empty"><div className="plan-empty-icon"><BookOpen size={21} /></div><div><h3>A small, connected course</h3><p>Your plan will build on your goal, what you already know, and the resources you add here.</p></div><button className="button primary" disabled={!readyResources.length || pendingResources || generate.isPending} onClick={() => generate.mutate(undefined)}>
        {generate.isPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Create my plan <ChevronRight size={16} />
      </button></div>}
      {planWorking && <div className="progress-card"><LoaderCircle className="spin" size={19} /><div><strong>Putting your learning path together</strong><p>We’re reading your material and arranging the ideas in a useful order.</p></div></div>}
      {(generate.error || planError) && <p className="notice error" role="alert">{planError || generate.error?.message}</p>}
      {!readyResources.length && resources.length > 0 && <p className="notice">We’ll make the plan as soon as your resources are ready.</p>}
      {pendingResources && <p className="notice">Your files are being prepared. You can stay on this page; we’ll update when they’re ready.</p>}
      {plan && <div className="plan-card">
        {plan.rationale && <p className="plan-rationale">{plan.rationale}</p>}
        <div className="lesson-list">{plan.lessons.map((lesson, index) => <article className="lesson-card" key={`${index}-${lesson.title}`}>
          <div className="lesson-number"><span>{String(index + 1).padStart(2, '0')}</span>{index < plan.lessons.length - 1 && <span className="lesson-stem" />}</div>
          <div className="lesson-content">
            <label className="visually-hidden" htmlFor={`title-${index}`}>Episode {index + 1} title</label>
            <input id={`title-${index}`} className="lesson-title-input" value={lesson.title} disabled={courseActive} onChange={(event) => changeLesson(index, (item) => ({ ...item, title: event.target.value }))} />
            <label className="visually-hidden" htmlFor={`objective-${index}`}>What episode {index + 1} will teach</label>
            <textarea id={`objective-${index}`} rows={2} value={lesson.objective} disabled={courseActive} onChange={(event) => changeLesson(index, (item) => ({ ...item, objective: event.target.value }))} />
            <details className="source-detail"><summary>Based on {lesson.sourceRefs.length} source {lesson.sourceRefs.length === 1 ? 'excerpt' : 'excerpts'}</summary>
              {lesson.sourceRefs.map((ref, refIndex) => {
                const source = resources.find((resource) => resource.id === ref.resourceId);
                return <blockquote key={`${ref.resourceId}-${refIndex}`}>{source?.filename || 'Source'}{ref.page ? ` · page ${ref.page}` : ''}: “{ref.excerpt}”</blockquote>;
              })}
            </details>
          </div>
          {!courseActive && <div className="lesson-move"><button className="icon-button" disabled={index === 0} aria-label={`Move episode ${index + 1} up`} onClick={() => moveLesson(index, -1)}><ArrowUp size={16} /></button><button className="icon-button" disabled={index === plan.lessons.length - 1} aria-label={`Move episode ${index + 1} down`} onClick={() => moveLesson(index, 1)}><ArrowDown size={16} /></button></div>}
        </article>)}</div>

        {!courseActive && <div className="plan-actions">
          <div className="duration-control"><label htmlFor="course-length">Course length <strong>{countChoice || plan.lessons.length} days</strong></label><input id="course-length" type="range" min="3" max="30" value={countChoice || plan.lessons.length} onChange={(event) => setCountChoice(Number(event.target.value))} /><small>Choose how gradually you want to explore the topic.</small>
            {countChoice !== plan.lessons.length && <button className="text-button" disabled={generate.isPending || pendingResources} onClick={() => generate.mutate(countChoice || undefined)}>{generate.isPending ? 'Updating…' : 'Regenerate this length'}</button>}
          </div>
          <div className="approval-actions">
            {changed && <button className="button secondary" disabled={savePlan.isPending || generate.isPending} onClick={() => {
              const checked = planDraftSchema.safeParse(draft);
              if (checked.success) savePlan.mutate(checked.data);
            }}>{savePlan.isPending ? 'Saving…' : 'Save edits'}</button>}
            <button className="button primary" disabled={changed || approve.isPending || savePlan.isPending || generate.isPending} onClick={() => approve.mutate()}>
              {approve.isPending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Approve this plan
            </button>
          </div>
          {(savePlan.error || approve.error) && <p className="notice error" role="alert">{savePlan.error?.message || approve.error?.message}</p>}
          <p className="subtle approval-note">We’ll make your first audio story as soon as you approve. Then a new one each day at 8:00 in your local time.</p>
        </div>}
      </div>}
      {course.state === 'validating' && <div className="progress-card"><LoaderCircle className="spin" size={19} /><div><strong>Checking your plan against your material</strong><p>If it asks for something your sources don’t support, we’ll point that out for you.</p></div></div>}
    </section>}

    {courseActive && <section className="plan-section active-course-section">
      <div className="section-heading"><div><span className="eyebrow">A little each day</span><h2>Your episodes</h2></div><Link className="text-button" to={`/settings/${id}`}>Course settings <ChevronRight size={15} /></Link></div>
      {course.approvedPlan && <p className="plan-rationale">{course.approvedPlan.rationale}</p>}
      <EpisodeList course={course} />
    </section>}

    <footer className="course-footer"><button className="text-button delete-link" onClick={() => {
      if (window.confirm(`Delete “${course.title}” and all of its material and episodes?`)) removeKnowledge.mutate();
    }}><Trash2 size={15} /> Delete this knowledge base</button>{removeKnowledge.error && <span role="alert" className="field-error">{removeKnowledge.error.message}</span>}</footer>
  </main>;
}

function EpisodeList({ course }: { course: CourseDetails }) {
  const planned = course.approvedPlan?.lessons ?? [];
  return <div className="episode-library">{planned.map((lesson, index) => {
    const episode = course.episodes.find((item) => item.index === index + 1);
    return <article key={`${lesson.title}-${index}`} className={`episode-row ${episode?.state === 'ready' ? 'is-ready' : ''}`}>
      <span className="episode-row-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="episode-row-copy"><h3>{episode?.title || lesson.title}</h3><p>{lesson.objective}</p></div>
      {episode?.state === 'ready' ? <Link className="button small-play" to={`/episodes/${episode.id}`} aria-label={`Listen to ${episode.title}`}><Headphones size={16} /> Listen</Link>
        : <span className="episode-row-state">{episode?.state === 'failed' ? episode.error || 'Needs a retry' : episode ? 'Preparing audio' : 'Arrives each day'}</span>}
    </article>;
  })}</div>;
}
