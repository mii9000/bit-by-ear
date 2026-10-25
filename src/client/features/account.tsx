import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Headphones, Sparkles } from 'lucide-react';
import { setCsrfToken } from '../api.js';

const accountSchema = z.object({ email: z.string().email('Enter a valid email address.').max(254), password: z.string().min(10, 'Use at least 10 characters.').max(200) });
type AccountForm = z.infer<typeof accountSchema>;

export function AccountScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [createAccount, setCreateAccount] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<AccountForm>();

  const submit = handleSubmit(async (values) => {
    setError('');
    const parsed = accountSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check your details.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${createAccount ? 'signup' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(parsed.data),
      });
      const body = await response.json() as { error?: string; csrfToken?: string };
      if (!response.ok || !body.csrfToken) throw new Error(body.error || 'Could not sign in.');
      setCsrfToken(body.csrfToken);
      onSignedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  });

  return <main className="auth-wrap">
    <section className="auth-card" aria-labelledby="welcome-title">
      <span className="brand-mark large"><Headphones size={28} strokeWidth={1.8} /></span>
      <p className="eyebrow">A little wiser, two minutes a day</p>
      <h1 id="welcome-title">Learning that fits into life.</h1>
      <p className="intro-copy">Bring the material you care about. We’ll turn it into short audio stories you can listen to, one a day.</p>
      <form className="stack-form" onSubmit={(event) => { void submit(event); }} noValidate>
        <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} /></label>
        {errors.email && <span className="field-error">{errors.email.message}</span>}
        <label>Password<input type="password" autoComplete={createAccount ? 'new-password' : 'current-password'} placeholder={createAccount ? 'At least 10 characters' : 'Your password'} {...register('password')} /></label>
        {errors.password && <span className="field-error">{errors.password.message}</span>}
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button primary full" type="submit" disabled={busy}>{busy ? 'One moment…' : createAccount ? 'Create your account' : 'Sign in'}</button>
      </form>
      <button className="text-button account-toggle" type="button" onClick={() => { setError(''); setCreateAccount((value) => !value); }}>
        {createAccount ? 'Already have an account? Sign in' : 'New to Bit by Ear? Create an account'}
      </button>
      <p className="subtle auth-foot"><Sparkles size={14} /> Made for curiosity, at your own pace.</p>
    </section>
  </main>;
}
