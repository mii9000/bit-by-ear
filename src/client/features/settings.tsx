import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, Check, Clock3, Download, LoaderCircle, Pause, Play } from 'lucide-react';
import { api, post } from '../api.js';
import { enablePush, isInstalled, type PushSettings } from '../pwa.js';
import type { CourseState } from '../../shared/contracts.js';

type Settings = { course: { id: string; title: string; state: CourseState; timezone: string | null; deliveryTime: string | null; nextDueAt: string | null } };

export function SettingsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState('');
  const [time, setTime] = useState('');
  const query = useQuery({ queryKey: ['course', id], queryFn: () => api<Settings>(`/api/courses/${id}`) });
  const pushSettings = useQuery({ queryKey: ['push-settings'], queryFn: () => api<PushSettings>('/api/push/public-key') });
  const save = useMutation({
    mutationFn: (body: { timezone?: string; deliveryTime?: string; paused?: boolean }) => api(`/api/courses/${id}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: async (_result, values) => {
      await queryClient.invalidateQueries({ queryKey: ['course', id] });
      if (values.paused === undefined) { setTimezone(''); setTime(''); }
    },
  });
  const push = useMutation({ mutationFn: () => enablePush(pushSettings.data ?? { enabled: false, publicKey: null }) });

  if (query.isPending) return <div className="loading"><LoaderCircle className="spin" /> Loading listening settings…</div>;
  if (query.error || !query.data) return <main className="page-shell"><h1>Settings couldn’t load</h1><p className="notice error" role="alert">{query.error?.message || 'This learning series could not be opened.'}</p><button className="button secondary" onClick={() => void query.refetch()}>Try again</button><button className="text-button" onClick={() => navigate('/')}>Back to your library</button></main>;
  const { course } = query.data;
  const courseTimezone = timezone || course.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const courseTime = time || course.deliveryTime || '08:00';
  const notificationsAvailable = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const installed = isInstalled();

  return <main className="page-shell settings-page">
    <button className="back-link as-button" onClick={() => navigate(`/knowledge/${id}`)}><ArrowLeft size={16} /> Back to {course.title}</button>
    <header className="settings-title"><h1>Listening settings</h1><p>Set a rhythm that fits your day.</p></header>
    <section className="settings-card">
      <div className="settings-card-heading"><span className="icon-disc"><Clock3 size={19} /></span><div><h2>Your daily moment</h2><p>New episodes are prepared even when the app is closed. Listen whenever it suits you.</p></div></div>
      <div className="form-grid settings-grid">
        <label>Time zone<select disabled={save.isPending} value={courseTimezone} onChange={(event) => { setTimezone(event.target.value); save.reset(); }}>{[...new Set([browserTimeZone, course.timezone || '', 'UTC', 'Europe/Amsterdam', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo'])].filter(Boolean).map((zone) => <option key={zone} value={zone}>{zone}{zone === browserTimeZone ? ' · your device' : ''}</option>)}</select></label>
        <label>Daily episode time<input type="time" disabled={save.isPending} value={courseTime} onChange={(event) => { setTime(event.target.value); save.reset(); }} /></label>
      </div>
      <div className="settings-actions"><span className="subtle">Daily schedule: {courseTime} · {courseTimezone}</span><button className="button secondary" onClick={() => save.mutate({ timezone: courseTimezone, deliveryTime: courseTime })} disabled={save.isPending || (!timezone && !time)}>{save.isPending ? 'Saving…' : 'Save time'}</button></div>
      {save.variables?.paused === undefined && save.error && <p className="notice error" role="alert">{save.error.message}</p>}
      {save.variables?.paused === undefined && save.isSuccess && <p className="notice success" role="status"><Check size={16} /> Your listening time is saved.</p>}
    </section>

    <section className="settings-card">
      <div className="settings-card-heading"><span className="icon-disc"><Bell size={19} /></span><div><h2>Know when it’s ready</h2><p>Get a notification when a new episode is ready. Listen whenever you’re ready.</p></div></div>
      {!notificationsAvailable ? <div className="notice"><BellOff size={16} /> This browser doesn’t support notifications. Your new episodes will still be here in the app.</div>
        : pushSettings.isPending ? <p className="subtle" role="status">Checking notification availability…</p>
        : pushSettings.error ? <div><p className="notice error" role="alert">Notification settings couldn’t load. Try again to check availability.</p><button className="button secondary" onClick={() => void pushSettings.refetch()}>Try again</button></div>
        : !pushSettings.data?.enabled || !pushSettings.data.publicKey ? <p className="notice">Notifications aren’t available for this app yet. Your new episodes will still be here when you return.</p>
        : <div className="push-row"><div><strong>{Notification.permission === 'granted' ? 'This device can receive notifications' : 'Notifications are optional'}</strong><small>Listening works normally if you leave notifications off.</small></div><button className="button secondary" onClick={() => push.mutate()} disabled={push.isPending || Notification.permission === 'denied'}>{push.isPending ? <LoaderCircle size={15} className="spin" /> : <Bell size={15} />} {Notification.permission === 'granted' ? 'Enable on this device' : 'Enable notifications'}</button></div>}
      {notificationsAvailable && pushSettings.data?.enabled && pushSettings.data.publicKey && Notification.permission === 'denied' && <p className="notice" role="status">Notifications are blocked for this browser. You can allow them in your browser or device settings. Your episodes will still be here in the app.</p>}
      {push.error && <p className="notice error" role="alert">{push.error.message}</p>}
      {push.isSuccess && <p className="notice success" role="status"><Check size={16} /> Notifications are on for this device.</p>}
    </section>

    {!installed && <section className="settings-card install-card">
      <div className="settings-card-heading"><span className="icon-disc"><Download size={19} /></span><div><h2>Keep Bit by Ear close</h2><p>Add the app to your Home Screen for a calmer, full-screen listening experience.</p></div></div>
      <div className="install-help"><span><b>iPhone or iPad</b>Open Share in Safari, then choose <em>Add to Home Screen</em>. Notifications need the installed app and iOS 16.4 or later.</span><span><b>Android</b>Open your browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</span></div>
    </section>}

    {['active', 'paused'].includes(course.state) && <section className="settings-card pause-card">
      <div className="settings-card-heading"><span className="icon-disc">{course.state === 'paused' ? <Play size={19} /> : <Pause size={19} />}</span><div><h2>{course.state === 'paused' ? 'Take your time' : 'Need a little pause?'}</h2><p>{course.state === 'paused' ? 'Your episodes and listening position are saved. Resume whenever you’re ready for the next idea.' : 'Pause new episodes whenever you need to. Your existing episodes and listening position stay saved.'}</p></div></div>
      <div className="pause-actions">
        <button className="button secondary" onClick={() => save.mutate({ paused: course.state !== 'paused' })} disabled={save.isPending}>{save.isPending ? 'Updating…' : course.state === 'paused' ? 'Resume daily episodes' : 'Pause new episodes'}</button>
        {save.variables?.paused !== undefined && save.error && <p className="notice error" role="alert">{save.error.message}</p>}
        {save.variables?.paused !== undefined && save.isSuccess && <p className="notice success" role="status"><Check size={16} /> {save.variables.paused ? 'New episodes are paused.' : 'Daily episodes have resumed.'}</p>}
      </div>
    </section>}
  </main>;
}
