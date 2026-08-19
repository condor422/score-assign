import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionContext';
import { ApiError } from '../lib/api';
import { BrandMark } from '../components/BrandMark';

export function SignInPage(): JSX.Element {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="space-y-3">
          <BrandMark variant="lockup" />
          <div>
            <h1 className="text-lg font-semibold">Sign in to ScoreAssign</h1>
            <p className="hint">Part assignment for flute choirs and ensembles.</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button className="btn-primary w-full" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="hint">
          New here?{' '}
          <Link className="underline" to="/sign-up">
            Create a workspace
          </Link>
        </p>
        <p className="hint">
          Playing in an ensemble rather than running one?{' '}
          <Link className="underline" to="/musician/sign-in">
            Musician sign-in
          </Link>{' '}
          uses an emailed link instead of a password.
        </p>
      </form>
    </div>
  );
}
