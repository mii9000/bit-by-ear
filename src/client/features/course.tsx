import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, FileText, Headphones, LoaderCircle, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react';
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
  const approvalRequested = useRef(false);
  const query = useQuery({
    queryKey: ['course', id], queryFn: () => api<CourseResponse>(`/api/courses/${id}`),
    refetchInterval: (state) => {
      const data = state.state.data as CourseResponse | undefined;
      return data?.course.state === 'validating' || data?.course.planJob?.status === 'pending' || data?.course.planJob?.status === 'running' || data?.resources.some((resource) => resource.status === 'pending') || data?.course.episodes.some((episode) => episode.state === 'pending' || episode.state === 'generating') ? 2000 : false;
    },
  });

  useEffect(() => {
    if (query.data?.course.state === 'active' && approvalRequested.current) {
      document.getElementById('episodes-heading')?.scrollIntoView({ block: 'start' });
      approvalRequested.current = false;
    }
  }, [query.data?.course.state]);

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
  const retryEpisode = useMutation({ mutationFn: () => post(`/api/courses/${id}/retry`, {}), onSuccess: () => void invalidate() });
  const generate = useMutation({ mutationFn: (requestedCount?: number) => post<{ jobId: string }>(`/api/courses/${id}/plan/generate`, { requestedCount, requestId: crypto.randomUUID() }), onSuccess: () => { setDraft(null); setDraftRevision(null); void invalidate(); } });
  const savePlan = useMutation({ mutationFn: (plan: PlanDraft) => {
    const checked = planDraftSchema.safeParse(plan);
    if (!checked.success) throw new Error('Check each episode’s title, learning objective, and sources before saving.');
    return api<{ revision: number }>(`/api/courses/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ revision: query.data!.course.revision, plan: checked.data }) });
  }, onSuccess: async (response) => { setDraftRevision(response.revision); await invalidate(); } });
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
  }, onSuccess: () => { approvalRequested.current = true; void invalidate(); } });
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
  const canEdit = course.state === 'draft' && !approve.isPending;
  const planBusy = !canEdit || planWorking || generate.isPending;
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

  const resourcePanel = (
    <details className="resource-panel" open={!courseActive}>
      <summary className="resource-summary"><h2><span className="resource-title">Your resources</span><span className="count-pill" aria-label={`${resources.length} of 10 resources`}>{resources.length}/10</span><ChevronRight size={18} className="disclosure-chevron" /></h2></summary>
      {resources.length > 0 && <ul className="resource-list">{resources.map((resource) => <li className="resource-row" key={resource.id}>
        <span className="file-icon"><FileText size={17} /></span><span className="file-name"><strong title={resource.filename}>{resource.filename}</strong><small>{resource.status === 'ready' ? `${resource.characters?.toLocaleString()} characters · ready to use` : resource.status === 'failed' ? resource.error : 'Preparing your resource…'}</small></span>
        <StatusPill state={resource.status} />
        {canEdit && <button className="icon-button subtle-button" disabled={removeResource.isPending} aria-label={`Remove ${resource.filename}`} onClick={() => removeResource.mutate(resource.id)}><Trash2 size={16} /></button>}
      </li>)}</ul>}
      {canEdit && resources.length < 10 && <label className={`upload-drop ${upload.isPending ? 'busy' : ''}`}>
        <input type="file" accept=".pdf,.md,.markdown,.txt,text/plain,text/markdown,application/pdf" disabled={upload.isPending} onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) upload.mutate(file);
          event.currentTarget.value = '';
        }} />
        <span className="upload-symbol">{upload.isPending ? <LoaderCircle className="spin" size={19} /> : <UploadCloud size={20} />}</span>
        <span><strong>{upload.isPending ? 'Preparing your file…' : 'Add a resource'}</strong><small>PDF, Markdown, or text · up to 5 MB each</small></span><Plus size={17} className="upload-plus" />
      </label>}
      {uploadError && <p className="notice error" role="alert">{uploadError}</p>}
      {removeResource.error && <p className="notice error" role="alert">{removeResource.error.message}</p>}
      {resources.length === 0 && <div className="empty-resources"><Sparkles size={19} /><p>Add your notes or documents. We’ll use them to plan a series of small, connected lessons.</p></div>}
    </details>
  );

  return <main className="page-shell course-shell">
    <Link className="back-link" to="/"><ArrowLeft size={16} /> Your library</Link>
    <section className="course-title-row">
      <div><h1>{course.title}</h1><p className="topic-label">{course.topic}</p>{!courseActive && <p className="course-goal">{course.goal}</p>}</div>
      <StatusPill state={course.state} />
    </section>

    {!courseActive && resourcePanel}

    {!courseActive && <section className="plan-section">
      <div className="section-heading plan-heading"><h2>{plan ? 'Your learning plan' : 'Your plan comes next'}</h2>{plan && <span className="count-pill">{plan.lessons.length} days</span>}</div>
      {!plan && !planWorking && <div className="plan-empty"><div><h3>One idea at a time</h3><p>We’ll arrange your material into small daily lessons, starting with what you already know. Review and adjust the plan before you begin.</p></div><button className="button primary" disabled={!readyResources.length || pendingResources || generate.isPending} onClick={() => generate.mutate(undefined)}>
        {generate.isPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Create my plan <ChevronRight size={16} />
      </button></div>}
      {planWorking && <div className="progress-card" role="status"><LoaderCircle className="spin" size={19} /><div><strong>Shaping your learning plan</strong><p>We’re reading your material and putting the ideas in an order that builds gradually.</p></div></div>}
      {(generate.error || planError) && <p className="notice error" role="alert">{planError || generate.error?.message}</p>}
      {!readyResources.length && resources.length > 0 && <p className="notice">Once your resources are ready, choose Create my plan to continue.</p>}
      {pendingResources && <p className="notice">Your files are being prepared. You can stay on this page; we’ll update when they’re ready.</p>}
      {plan && <div className="plan-card">
        {plan.rationale && <p className="plan-rationale">{plan.rationale}</p>}
        <div className="lesson-list">{plan.lessons.map((lesson, index) => <article className="lesson-card" key={index}>
          <div className="lesson-number"><span>{String(index + 1).padStart(2, '0')}</span></div>
          <div className="lesson-content">
            <label className="visually-hidden" htmlFor={`title-${index}`}>Episode {index + 1} title</label>
            <input id={`title-${index}`} className="lesson-title-input" value={lesson.title} disabled={planBusy} onChange={(event) => changeLesson(index, (item) => ({ ...item, title: event.target.value }))} />
            <label className="visually-hidden" htmlFor={`objective-${index}`}>What episode {index + 1} will teach</label>
            <textarea id={`objective-${index}`} rows={3} value={lesson.objective} disabled={planBusy} onChange={(event) => changeLesson(index, (item) => ({ ...item, objective: event.target.value }))} />
            <details className="source-detail"><summary>Based on {lesson.sourceRefs.length} source {lesson.sourceRefs.length === 1 ? 'excerpt' : 'excerpts'}</summary>
              {lesson.sourceRefs.map((ref, refIndex) => {
                const source = resources.find((resource) => resource.id === ref.resourceId);
                return <blockquote key={`${ref.resourceId}-${refIndex}`}>{source?.filename || 'Source'}{ref.page ? ` · page ${ref.page}` : ''}: “{ref.excerpt}”</blockquote>;
              })}
            </details>
          </div>
          {!courseActive && <div className="lesson-move"><button className="icon-button" disabled={index === 0 || planBusy} aria-label={`Move episode ${index + 1} up`} onClick={() => moveLesson(index, -1)}><ArrowUp size={16} /></button><button className="icon-button" disabled={index === plan.lessons.length - 1 || planBusy} aria-label={`Move episode ${index + 1} down`} onClick={() => moveLesson(index, 1)}><ArrowDown size={16} /></button></div>}
        </article>)}</div>

        {!courseActive && <div className="plan-actions">
          <div className="duration-control"><label htmlFor="course-length">Series length <strong>{countChoice || plan.lessons.length} days</strong></label><input id="course-length" type="range" min="3" max="30" disabled={planBusy} value={countChoice || plan.lessons.length} onChange={(event) => setCountChoice(Number(event.target.value))} /><small>Choose how many daily episodes you’d like. Each explores one idea in two minutes or less.</small>
            {countChoice !== plan.lessons.length && <button className="text-button" disabled={planBusy || pendingResources} onClick={() => generate.mutate(countChoice || undefined)}>{generate.isPending ? 'Updating…' : 'Regenerate this length'}</button>}
          </div>
          <div className="approval-actions">
            {changed && <button className="button secondary" disabled={savePlan.isPending || planBusy} onClick={() => savePlan.mutate(plan)}>{savePlan.isPending ? 'Saving…' : 'Save edits'}</button>}
            <button className="button primary" disabled={changed || planBusy || savePlan.isPending} onClick={() => approve.mutate()}>
              {approve.isPending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Approve this plan
            </button>
          </div>
          {changed && <p className="subtle unsaved-note" role="status">You have unsaved changes. Save your edits before approving the plan.</p>}
          {(savePlan.error || approve.error) && <p className="notice error" role="alert">{savePlan.error?.message || approve.error?.message}</p>}
          <p className="subtle approval-note">After your plan is checked, we’ll prepare your first episode. The rest will follow daily at your scheduled time.</p>
        </div>}
      </div>}
      {course.state === 'validating' && <div className="progress-card" role="status"><LoaderCircle className="spin" size={19} /><div><strong>Checking your plan against your material</strong><p>If it asks for something your sources don’t support, we’ll point that out for you.</p></div></div>}
    </section>}

    {courseActive && <section className="plan-section active-course-section">
      <div className="section-heading episode-heading"><h2 id="episodes-heading">Your episodes</h2><Link className="text-button" to={`/settings/${id}`}>Listening settings <ChevronRight size={15} /></Link></div>
      <p className="section-description">One idea at a time.</p>
      {course.approvedPlan && <details className="plan-overview"><summary>About your learning plan</summary><p><strong>Your goal: </strong>{course.goal}</p><p>{course.approvedPlan.rationale}</p></details>}
      <EpisodeList course={course} onRetry={() => retryEpisode.mutate()} retrying={retryEpisode.isPending} />
      {retryEpisode.error && <p className="notice error" role="alert">{retryEpisode.error.message}</p>}
    </section>}

    {courseActive && resourcePanel}

    <footer className="course-footer"><button className="text-button delete-link" onClick={() => {
      if (window.confirm(`Delete “${course.title}” and all of its material and episodes?`)) removeKnowledge.mutate();
    }}><Trash2 size={15} /> Delete this knowledge base</button>{removeKnowledge.error && <span role="alert" className="field-error">{removeKnowledge.error.message}</span>}</footer>
  </main>;
}

function EpisodeList({ course, onRetry, retrying }: { course: CourseDetails; onRetry: () => void; retrying: boolean }) {
  const planned = course.approvedPlan?.lessons ?? [];
  return <div className="episode-library" aria-live="polite" aria-relevant="additions text">{planned.map((lesson, index) => {
    const episode = course.episodes.find((item) => item.index === index + 1);
    return <article key={`${lesson.title}-${index}`} className="episode-row">
      <span className="episode-row-index">{String(index + 1).padStart(2, '0')}</span>
      <div className="episode-row-copy"><h3>{episode?.title || lesson.title}</h3><p>{lesson.objective}</p></div>
      {episode?.state === 'ready' ? <Link className="button small-play" to={`/episodes/${episode.id}`} aria-label={`Listen to ${episode.title}`}><Headphones size={16} /> Listen</Link>
        : episode?.state === 'failed' ? <div className="episode-row-state episode-failed"><span>{episode.error || 'This episode couldn’t be prepared.'}</span><button className="button secondary" disabled={retrying} onClick={onRetry}>{retrying ? 'Retrying…' : 'Retry episode'}</button></div>
          : <span className="episode-row-state">{episode ? 'Preparing audio' : course.state === 'paused' ? 'Generation paused' : 'Arrives each day'}</span>}
    </article>;
  })}</div>;
}
