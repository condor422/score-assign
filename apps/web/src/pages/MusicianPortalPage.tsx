import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import type { MyParts } from '../lib/types';

/**
 * Musician-facing portal. Sign-in is a one-time emailed link, so the only
 * credential this page ever holds is a short-lived token kept in memory.
 */
export function MusicianPortalPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: (linkToken: string) =>
      api<{ accessToken: string }>('/musician-auth/verify', {
        method: 'POST',
        body: { token: linkToken },
      }),
    onSuccess: (result) => setToken(result.accessToken),
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'That link is no longer valid'),
  });

  const linkToken = params.get('token');
  useEffect(() => {
    if (linkToken && !token && !verify.isPending && !verify.isError) verify.mutate(linkToken);
  }, [linkToken, token, verify]);

  const requestLink = useMutation({
    mutationFn: () => api('/musician-auth/request-link', { method: 'POST', body: { email } }),
    onSuccess: () => setSent(true),
  });

  const parts = useQuery({
    queryKey: ['my-parts', token],
    queryFn: () => api<MyParts>('/musician/my-parts', { token }),
    enabled: Boolean(token),
  });

  const confirm = useMutation({
    mutationFn: (input: { assignmentId: string; accepted: boolean }) =>
      api('/musician/confirm', { method: 'POST', body: input, token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-parts', token] });
    },
  });

  if (!token) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="card w-full max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">See your parts</h1>
          {sent ? (
            <p className="text-sm text-slate-600">
              If that address is registered, a sign-in link is on its way. The link is good for 30 minutes.
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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <p className="text-sm text-slate-500">{parts.data?.tenant.name}</p>
        <h1 className="text-2xl font-semibold">Your parts</h1>
        <p className="hint">{parts.data?.musician.name}</p>
      </header>

      <div className="space-y-3">
        {parts.data?.assignments.map((assignment) => (
          <div key={assignment.id} className="card flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">
                {assignment.instrumentName} {assignment.partLabel}
              </p>
              <p className="hint">
                {assignment.songTitle}
                {assignment.seasonName ? ` · ${assignment.seasonName}` : ''}
              </p>
            </div>
            {assignment.confirmation === 'pending' ? (
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => confirm.mutate({ assignmentId: assignment.id, accepted: true })}
                >
                  Accept
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => confirm.mutate({ assignmentId: assignment.id, accepted: false })}
                >
                  Decline
                </button>
              </div>
            ) : (
              <span
                className={
                  assignment.confirmation === 'accepted'
                    ? 'badge bg-green-100 text-green-800'
                    : 'badge bg-red-100 text-red-800'
                }
              >
                {assignment.confirmation}
              </span>
            )}
          </div>
        ))}
        {parts.data?.assignments.length === 0 ? (
          <p className="hint">You have no parts yet. Your director will assign them soon.</p>
        ) : null}
      </div>
    </div>
  );
}
