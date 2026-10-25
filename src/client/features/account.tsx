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
  const { register, handleSubmit, setError: setFieldError, clearErrors, formState: { errors } } = useForm<AccountForm>();

  const submit = handleSubmit(async (values) => {
    setError('');
    clearErrors();
    const parsed = accountSchema.safeParse(values);
    if (!parsed.success) {
      for (const [index, issue] of parsed.error.issues.entries()) setFieldError(issue.path[0] as keyof AccountForm, { message: issue.message }, { shouldFocus: index === 0 });
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
      <div className="auth-brand"><span className="brand-mark large"><Headphones size={28} strokeWidth={1.8} /></span><div><span className="wordmark">bit by ear</span><p className="brand-tagline">Small listens. Steady learning.</p></div></div>
      <h1 id="welcome-title">Something you’ve been meaning to learn.</h1>
      <p className="intro-copy">Turn your own material into connected daily audio stories. One new idea at a time, in two minutes or less.</p>
      <form className="stack-form" onSubmit={(event) => { void submit(event); }} noValidate>
        <label>Email address<input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} placeholder="you@example.com" {...register('email')} />
          {errors.email && <span id="email-error" className="field-error">{errors.email.message}</span>}
        </label>
        <label>Password<input type="password" autoComplete={createAccount ? 'new-password' : 'current-password'} required maxLength={200} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : createAccount ? 'password-hint' : undefined} placeholder={createAccount ? 'Choose a password' : 'Your password'} {...register('password')} />
          {errors.password ? <span id="password-error" className="field-error">{errors.password.message}</span> : createAccount && <small id="password-hint" className="subtle">Use at least 10 characters.</small>}
        </label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button primary full" type="submit" disabled={busy}>{busy ? (createAccount ? 'Creating account…' : 'Signing in…') : createAccount ? 'Create your account' : 'Sign in'}</button>
      </form>
      <button className="text-button account-toggle" type="button" onClick={() => { setError(''); clearErrors(); setCreateAccount((value) => !value); }}>
        {createAccount ? 'Already have an account? Sign in' : 'New to Bit by Ear? Create an account'}
      </button>
      <p className="subtle auth-foot"><Sparkles size={14} /> A little listening, at your own pace.</p>
    </section>
  </main>;
}
