import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth/SessionContext';
import { ApiError } from '../lib/api';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function SignUpPage(): JSX.Element {
  const { signUp } = useSession();
  const [organizationName, setOrganizationName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUp({ organizationName, slug, name, email, password });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the workspace');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Create your workspace</h1>
          <p className="hint">7 day trial with everything included. No card required.</p>
        </div>
        <div>
          <label className="label" htmlFor="org">
            Ensemble or organization
          </label>
          <input
            id="org"
            className="input"
            value={organizationName}
            onChange={(e) => {
              setOrganizationName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="slug">
            Workspace address
          </label>
          <div className="flex items-center gap-2">
            <input
              id="slug"
              className="input"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
              required
            />
            <span className="whitespace-nowrap text-sm text-slate-500">.scoreassign.com</span>
          </div>
          <p className="hint">Your musicians will use this address for the intake form.</p>
        </div>
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="hint">At least 12 characters, with upper case, lower case and a digit.</p>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="btn-primary w-full" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Start free trial'}
        </button>
        <p className="hint">
          Already have a workspace?{' '}
          <Link className="underline" to="/sign-in">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
