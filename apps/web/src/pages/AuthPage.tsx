import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Github, KeyRound, Mail, Network, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { safeReturnTo } from '@/lib/navigation';
import { Button, Card, Field, Input, PageHeader } from '@/components/ui';

type Mode = 'signin' | 'signup' | 'magic' | 'recover' | 'reset';

export default function AuthPage() {
  const { configured, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'reset' ? 'reset' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const returnTo = safeReturnTo(
    params.get('returnTo') || (location.state as { from?: string } | null)?.from,
  );
  const redirectUrl = new URL('/auth', window.location.origin);
  redirectUrl.searchParams.set('returnTo', returnTo);
  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
  };
  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signin') {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
        if (failure) throw failure;
        navigate(returnTo, { replace: true });
      } else if (mode === 'signup') {
        const { data, error: failure } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name, full_name: name },
            emailRedirectTo: redirectUrl.toString(),
          },
        });
        if (failure) throw failure;
        if (data.session) navigate(returnTo, { replace: true });
        else setMessage('Check your email for the confirmation link, then return here to sign in.');
      } else if (mode === 'magic') {
        const { error: failure } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectUrl.toString() },
        });
        if (failure) throw failure;
        setMessage(
          'If this address is eligible, a sign-in link is on its way. Open it in this browser to complete the sign-in.',
        );
      } else if (mode === 'recover') {
        const callback = new URL('/auth?mode=reset', window.location.origin);
        const { error: failure } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: callback.toString(),
        });
        if (failure) throw failure;
        setMessage(
          'If an account exists for that address, you will receive a password reset link.',
        );
      } else {
        const { error: failure } = await supabase.auth.updateUser({ password });
        if (failure) throw failure;
        setMessage('Your password has been updated. You can continue to your projects.');
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Authentication failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const oauth = async (provider: 'google' | 'github') => {
    if (!supabase) return;
    setError('');
    setBusy(true);
    try {
      const { error: failure } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectUrl.toString() },
      });
      if (failure) throw failure;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'This sign-in provider is unavailable.',
      );
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="auth-shell">
        <Link className="brand" to="/">
          <span className="brand-mark">
            <Network />
          </span>
          Subnet<span className="brand-iq">IQ</span>
        </Link>
        {!configured ? (
          <Card>
            <div className="empty-state" style={{ padding: '10px 0' }}>
              <ShieldCheck size={34} />
              <h1>Your private workspace</h1>
              <p className="muted">
                Accounts are not configured in this installation. Connect Supabase to enable
                sign-in, saved projects, progress, and conversation history.
              </p>
              <p className="muted small">
                Set the public Supabase URL and anonymous key, apply the included database
                migrations, and configure the API. The complete setup instructions are in the source
                archive.
              </p>
              <Link className="button button-primary" to="/tools">
                Continue with free tools
                <ArrowRight size={15} />
              </Link>
            </div>
          </Card>
        ) : user && mode !== 'reset' ? (
          <Card>
            <div className="empty-state" style={{ padding: '10px 0' }}>
              <ShieldCheck size={34} />
              <h1>You’re signed in</h1>
              <p className="muted">{user.email}</p>
              <Link className="button button-primary" to={returnTo}>
                Continue
                <ArrowRight size={15} />
              </Link>
              <Link to="/account">Manage account</Link>
            </div>
          </Card>
        ) : (
          <Card>
            <PageHeader
              title={
                mode === 'signup'
                  ? 'Make room for your work.'
                  : mode === 'magic'
                    ? 'One link. You’re in.'
                    : mode === 'recover'
                      ? 'Reset your password.'
                      : mode === 'reset'
                        ? 'Choose a new password.'
                        : 'Welcome back.'
              }
              description={
                mode === 'signup'
                  ? 'Keep your plans, progress, and conversations together.'
                  : 'Your network workspace is ready when you are.'
              }
            />
            {error && (
              <div className="error-banner" role="alert" style={{ marginBottom: 18 }}>
                {error}
              </div>
            )}
            {message && (
              <div className="success-banner" role="status" style={{ marginBottom: 18 }}>
                {message}
              </div>
            )}
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {mode === 'signup' && (
                <Field label="Display name">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </Field>
              )}
              {mode !== 'reset' && (
                <Field label="Email address">
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    maxLength={320}
                  />
                </Field>
              )}
              {['signin', 'signup', 'reset'].includes(mode) && (
                <Field
                  label={mode === 'reset' ? 'New password' : 'Password'}
                  hint={
                    mode === 'signin'
                      ? undefined
                      : 'Use at least 12 characters. A long, unique passphrase works well.'
                  }
                >
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={mode === 'signin' ? 1 : 12}
                    maxLength={128}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                  />
                </Field>
              )}
              <Button type="submit" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'magic'
                      ? 'Email me a sign-in link'
                      : mode === 'recover'
                        ? 'Send reset link'
                        : mode === 'reset'
                          ? 'Update password'
                          : 'Sign in'}
                <ArrowRight size={15} />
              </Button>
            </form>
            {mode === 'signin' && (
              <>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                  <Button variant="ghost" onClick={() => changeMode('magic')}>
                    <Mail size={13} />
                    Use a magic link
                  </Button>
                  <Button variant="ghost" onClick={() => changeMode('recover')}>
                    Forgot password?
                  </Button>
                </div>
                <div className="auth-divider">or continue with</div>
                <div className="grid-2" style={{ gap: 10 }}>
                  <Button variant="secondary" onClick={() => void oauth('google')} disabled={busy}>
                    <span aria-hidden="true" style={{ fontWeight: 800 }}>
                      G
                    </span>
                    Google
                  </Button>
                  <Button variant="secondary" onClick={() => void oauth('github')} disabled={busy}>
                    <Github size={16} />
                    GitHub
                  </Button>
                </div>
              </>
            )}
            <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}>
              <span className="small muted">
                {mode === 'signin' ? 'New to SubnetIQ?' : 'Already have an account?'}
              </span>
              <Button
                variant="ghost"
                onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                {mode === 'signin' ? 'Create an account' : 'Back to sign in'}
              </Button>
            </div>
            <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
              <KeyRound size={11} style={{ display: 'inline', marginRight: 4 }} />
              Authentication is managed by Supabase.
            </p>
          </Card>
        )}
        <p className="small muted" style={{ textAlign: 'center', marginTop: 22 }}>
          By using this workspace you agree to its <Link to="/terms">terms</Link> and{' '}
          <Link to="/privacy">privacy policy</Link>.
        </p>
        <Link className="button button-ghost" to="/tools" style={{ marginTop: 18 }}>
          <ArrowLeft size={13} />
          Back to the tools
        </Link>
      </div>
    </div>
  );
}
