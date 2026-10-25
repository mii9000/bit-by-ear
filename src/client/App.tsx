import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Headphones, LogOut, Settings2 } from 'lucide-react';
import { api } from './api.js';
import { setCsrfToken } from './api.js';
import { AccountScreen } from './features/account.js';
import { CoursePage } from './features/course.js';
import { LibraryPage } from './features/library.js';
import { PlayerPage } from './features/player.js';
import { SettingsPage } from './features/settings.js';
import { removePush } from './pwa.js';
import type { Viewer } from '../shared/contracts.js';

type Session = { user: Viewer; csrfToken: string };

export function App() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const result = await api<Session>('/api/session');
        setCsrfToken(result.csrfToken);
        return result;
      } catch (error) {
        if ((error as { status?: number }).status === 401) { setCsrfToken(null); return null; }
        throw error;
      }
    },
    retry: false,
  });
  const signedIn = Boolean(session.data?.user);

  if (session.isPending) return <div className="loading"><span className="brand-mark"><Headphones size={22} /></span> Opening your learning space…</div>;
  if (session.error) return <main className="auth-wrap"><p className="notice error">{session.error.message}</p><button className="button secondary" onClick={() => void session.refetch()}>Try again</button></main>;
  if (!signedIn) return <AccountScreen onSignedIn={() => void queryClient.invalidateQueries({ queryKey: ['session'] })} />;

  return <div className="app-frame">
    <header className="topbar"><Link to="/" className="wordmark"><span className="brand-mark"><Headphones size={19} /></span><span>bit by ear<small>A little wiser, two minutes a day</small></span></Link>
      <nav className="topnav" aria-label="Account"><Link to="/" className={location.pathname === '/' ? 'nav-link current' : 'nav-link'}>Your library</Link><span className="nav-email">{session.data!.user.email}</span><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={async () => {
        try { await removePush(); } catch { /* Logging out remains available when notifications are disabled. */ }
        try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* Clear local session state even when the server cannot be reached. */ } finally {
          setCsrfToken(null);
          await queryClient.clear();
        }
      }}><LogOut size={17} /></button></nav>
    </header>
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/knowledge/:id" element={<CoursePage />} />
      <Route path="/episodes/:id" element={<PlayerPage />} />
      <Route path="/settings/:id" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <footer className="site-footer"><span>Bit by Ear</span><span>Good things grow one little bit at a time.</span><span>Built with care for curious minds.</span></footer>
  </div>;
}
