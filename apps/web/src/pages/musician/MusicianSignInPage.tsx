import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useMusicianSession } from '../../auth/MusicianSession';

/** Sign-in is a one-time emailed link, so there is no password to manage. */
export function MusicianSignInPage(): JSX.Element {
  const { token } = useMusicianSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const requestLink = useMutation({
    mutationFn: () => api('/musician-auth/request-link', { method: 'POST', body: { email } }),
    onSuccess: () => setSent(true),
  });

  if (token) return <Navigate to="/musician/parts" replace />;

  return (
    <div className="card mx-auto max-w-sm space-y-3">
      <h1 className="text-lg font-semibold">See your parts</h1>
      {sent ? (
        <p className="text-sm text-slate-600">
          If that address is registered, a sign-in link is on its way. The link is good for 30
          minutes.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            requestLink.mutate();
          }}
        >
          <p className="hint">We will email you a sign-in link — no password needed.</p>
          <input
            className="input"
            type="email"
            placeholder="you@example.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn-primary w-full" type="submit" disabled={requestLink.isPending}>
            Email me a link
          </button>
        </form>
      )}
    </div>
  );
}
