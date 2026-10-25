import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Headphones, LoaderCircle, Pause, Play, Volume2 } from 'lucide-react';
import { Slider, SliderFill, SliderThumb, SliderTrack } from 'react-aria-components';
import { api, post } from '../api.js';

type EpisodeDetails = {
  id: string; index: number; title: string; state: 'ready'; script: string; sourceRefs: { resourceId: string; page: number | null; excerpt: string }[];
  durationSeconds: number; progressSeconds: number; finished: boolean; courseId: string; courseTitle: string;
};

export function PlayerPage() {
  const { id = '' } = useParams();
  const audio = useRef<HTMLAudioElement>(null);
  const latestSaved = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playError, setPlayError] = useState('');
  const query = useQuery({ queryKey: ['episode', id], queryFn: () => api<{ episode: EpisodeDetails }>(`/api/episodes/${id}`) });
  const episode = query.data?.episode;
  const save = useMutation({ mutationFn: (data: { positionSeconds: number; ended?: boolean }) => post(`/api/episodes/${id}/progress`, data) });

  useEffect(() => {
    const element = audio.current;
    if (!element || !episode) return;
    const restore = () => {
      const at = Math.max(0, Math.min(episode.progressSeconds, element.duration || episode.durationSeconds || 0));
      element.currentTime = at;
      setPosition(at);
      setDuration(element.duration || episode.durationSeconds || 0);
      latestSaved.current = at;
    };
    if (element.readyState >= 1) restore();
    else element.addEventListener('loadedmetadata', restore, { once: true });
    return () => element.removeEventListener('loadedmetadata', restore);
  }, [episode?.id, episode?.progressSeconds, episode?.durationSeconds]);

  if (query.isPending) return <div className="loading"><LoaderCircle className="spin" /> Opening your episode…</div>;
  if (query.error || !episode) return <main className="page-shell"><p className="notice error">{query.error?.message || 'This episode could not be found.'}</p><Link className="text-button" to="/">Back to your library</Link></main>;

  const currentDuration = duration || episode.durationSeconds;
  const percentage = currentDuration ? Math.min(position / currentDuration, 1) : 0;
  async function togglePlayback() {
    const element = audio.current;
    if (!element) return;
    setPlayError('');
    if (element.paused) {
      try { await element.play(); setPlaying(true); }
      catch { setPlayError('Audio could not start. Check your connection and try again.'); setPlaying(false); }
    } else {
      element.pause(); setPlaying(false);
    }
  }
  function savePosition(at: number, ended = false) {
    const clamped = Math.max(0, Math.min(at, currentDuration || 0));
    if (!ended && Math.abs(clamped - latestSaved.current) < 4) return;
    latestSaved.current = clamped;
    save.mutate({ positionSeconds: clamped, ended });
  }

  return <main className="listening-shell">
    <Link className="back-link player-back" to={`/knowledge/${episode.courseId}`}><ArrowLeft size={16} /> Back to {episode.courseTitle}</Link>
    <article className="player-card">
      <div className="listen-art" aria-hidden="true"><span className="listen-orbit orbit-a" /><span className="listen-orbit orbit-b" /><span className="listen-center"><Headphones size={35} strokeWidth={1.5} /></span><span className="listen-speck speck-a" /><span className="listen-speck speck-b" /></div>
      <p className="eyebrow">EPISODE {String(episode.index).padStart(2, '0')} <span className="eyebrow-dot">·</span> {episode.courseTitle}</p>
      <h1>{episode.title}</h1>
      <p className="player-subtitle">A short story about one new idea.</p>
      <audio ref={audio} preload="metadata" src={`/api/episodes/${episode.id}/audio`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => {
        const at = event.currentTarget.currentTime;
        setPosition(at);
        if (at - latestSaved.current >= 5) savePosition(at);
      }} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onSeeked={(event) => { setPosition(event.currentTarget.currentTime); savePosition(event.currentTarget.currentTime); }} onEnded={() => { setPlaying(false); setPosition(currentDuration); savePosition(currentDuration, true); }} onError={() => setPlayError('The audio couldn’t load. Check your connection or return to your library and try again.')} />
      <Slider
        className="audio-slider"
        aria-label="Audio progress"
        minValue={0}
        maxValue={Math.max(currentDuration, 1)}
        step={1}
        value={Math.min(position, currentDuration || 0)}
        onChange={(value) => {
          const next = Array.isArray(value) ? value[0]! : value;
          setPosition(next);
          if (audio.current) audio.current.currentTime = next;
        }}
    onChangeEnd={(value) => {
          const next = Array.isArray(value) ? value[0]! : value;
          savePosition(next);
        }}
      >
        <SliderTrack className="audio-track"><SliderFill className="audio-fill" /><SliderThumb className="audio-thumb" /></SliderTrack>
      </Slider>
      <div className="time-row"><span>{formatTime(position)}</span><span>{formatTime(currentDuration)}</span></div>
      <button className={`play-button ${playing ? 'is-playing' : ''}`} aria-label={playing ? 'Pause episode' : 'Play episode'} onClick={() => void togglePlayback()}>
        {playing ? <Pause size={24} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
        <span>{playing ? 'Pause' : 'Play episode'}</span>
      </button>
      {playError && <p className="notice error player-error" role="alert">{playError}</p>}
      <p className="subtle listening-hint"><Volume2 size={15} /> Get comfortable. This one’s under two minutes.</p>
    </article>
    <section className="transcript-card">
      <p className="eyebrow">Take a closer look</p>
      <details><summary>Read the story and see its sources</summary>
        <p className="transcript-copy">{episode.script}</p>
        {episode.sourceRefs.length > 0 && <div className="sources-box"><strong>From your learning material</strong>{episode.sourceRefs.map((ref, index) => <blockquote key={`${ref.resourceId}-${index}`}>“{ref.excerpt}”{ref.page ? ` · page ${ref.page}` : ''}</blockquote>)}</div>}
      </details>
    </section>
    <p className="subtle player-footnote">Made slowly. Ready whenever you are.</p>
    <span className="visually-hidden" aria-live="polite">{percentage > 0 ? `${Math.round(percentage * 100)} percent played` : ''}</span>
  </main>;
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
