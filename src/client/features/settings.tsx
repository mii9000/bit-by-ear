import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, Check, Clock3, Download, LoaderCircle, Pause, Play } from 'lucide-react';
import { api, post } from '../api.js';
import { enablePush, isInstalled } from '../pwa.js';
import type { CourseState } from '../../shared/contracts.js';

type Settings = { course: { id: string; title: string; state: CourseState; timezone: string | null; deliveryTime: string | null; nextDueAt: string | null } };

export function SettingsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['course', id], queryFn: () => api<Settings>(`/api/courses/${id}`) });
  const save = useMutation({
    mutationFn: (body: { timezone?: string; deliveryTime?: string; paused?: boolean }) => api(`/api/courses/${id}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { setError(''); setMessage('Your course settings are saved.'); void queryClient.invalidateQueries({ queryKey: ['course', id] }); },
    onError: (reason: Error) => { setMessage(''); setError(reason.message); },
  });
  const push = useMutation({ mutationFn: enablePush, onSuccess: () => { setMessage('Notifications are on for this device.'); setError(''); }, onError: (reason: Error) => { setError(reason.message); setMessage(''); } });

  if (query.isPending) return <div className="loading"><LoaderCircle className="spin" /> Loading course settings…</div>;
  if (query.error || !query.data) return <main className="page-shell"><p className="notice error">{query.error?.message}</p></main>;
  const { course } = query.data;
  const courseTimezone = timezone || course.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const courseTime = time || course.deliveryTime || '08:00';
  const notificationsAvailable = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const installed = isInstalled();

  return <main className="page-shell settings-page">
    <button className="back-link as-button" onClick={() => navigate(`/knowledge/${id}`)}><ArrowLeft size={16} /> Back to {course.title}</button>
    <header className="settings-title"><p className="eyebrow">The rhythm of your learning</p><h1>Course settings</h1><p>We take care of the daily lessons from here.</p></header>
    <section className="settings-card">
      <div className="settings-card-heading"><span className="icon-disc"><Clock3 size={19} /></span><div><h2>Your daily moment</h2><p>Episodes are prepared on the server, whether you open the app or not.</p></div></div>
      <div className="form-grid settings-grid">
        <label>Time zone<select value={courseTimezone} onChange={(event) => setTimezone(event.target.value)}>{[...new Set([browserTimeZone, course.timezone || '', 'UTC', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo'])].filter(Boolean).map((zone) => <option key={zone} value={zone}>{zone}{zone === browserTimeZone ? ' · your device' : ''}</option>)}</select></label>
        <label>Daily episode time<input type="time" value={courseTime} onChange={(event) => setTime(event.target.value)} /></label>
      </div>
      <div className="settings-actions"><span className="subtle">Next episode is expected around {courseTime} · {courseTimezone}</span><button className="button secondary" onClick={() => save.mutate({ timezone: courseTimezone, deliveryTime: courseTime })} disabled={save.isPending || (!timezone && !time)}>{save.isPending ? 'Saving…' : 'Save time'}</button></div>
    </section>

    <section className="settings-card">
      <div className="settings-card-heading"><span className="icon-disc"><Bell size={19} /></span><div><h2>Know when it’s ready</h2><p>Get one gentle notification when a new episode appears.</p></div></div>
      {notificationsAvailable ? <div className="push-row"><div><strong>{Notification.permission === 'granted' ? 'This device can receive notifications' : 'Notifications are optional'}</strong><small>Listening works normally if you leave notifications off.</small></div><button className="button secondary" onClick={() => push.mutate()} disabled={push.isPending || Notification.permission === 'denied'}>{push.isPending ? <LoaderCircle size={15} className="spin" /> : <Bell size={15} />} {Notification.permission === 'granted' ? 'Enable on this device' : 'Enable notifications'}</button></div>
        : <div className="notice"><BellOff size={16} /> This browser doesn’t support notifications. Your new lessons will still be here in the app.</div>}
    </section>

    {!installed && <section className="settings-card install-card">
      <div className="settings-card-heading"><span className="icon-disc"><Download size={19} /></span><div><h2>Keep Bit by Ear close</h2><p>Add the app to your Home Screen for a calmer, full-screen listening experience.</p></div></div>
      <div className="install-help"><span><b>iPhone or iPad</b>Open Share in Safari, then choose <em>Add to Home Screen</em>. Notifications need the installed app and iOS 16.4 or later.</span><span><b>Android</b>Open your browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</span></div>
    </section>}

    {['active', 'paused'].includes(course.state) && <section className="settings-card pause-card">
      <div className="settings-card-heading"><span className="icon-disc">{course.state === 'paused' ? <Play size={19} /> : <Pause size={19} />}</span><div><h2>{course.state === 'paused' ? 'Take your time' : 'Need a little pause?'}</h2><p>{course.state === 'paused' ? 'Your episodes are saved. We’ll pick up the next lesson when you’re ready.' : 'Pause future lessons. Your course and listening position stay right here.'}</p></div></div>
      <button className="button secondary" onClick={() => save.mutate({ paused: course.state !== 'paused' })} disabled={save.isPending}>{save.isPending ? 'Updating…' : course.state === 'paused' ? 'Resume my course' : 'Pause future lessons'}</button>
    </section>}
    {message && <p className="notice success" role="status"><Check size={16} /> {message}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </main>;
}
