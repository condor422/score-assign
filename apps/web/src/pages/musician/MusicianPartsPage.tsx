import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';
import { useMusicianSession } from '../../auth/MusicianSession';
import type { MyParts } from '../../lib/types';

const confirmationStyles: Record<string, string> = {
  accepted: 'badge bg-green-100 text-green-800',
  declined: 'badge bg-red-100 text-red-800',
  pending: 'badge bg-slate-100 text-slate-700',
};

export function MusicianPartsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { token } = useMusicianSession();
  /** Assignment the musician is declining, while they type an optional reason. */
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parts = useQuery({
    queryKey: ['my-parts', token],
    queryFn: () => api<MyParts>('/musician/my-parts', { token }),
    enabled: Boolean(token),
  });

  const confirm = useMutation({
    mutationFn: (input: { assignmentId: string; accepted: boolean; note?: string }) =>
      api('/musician/confirm', { method: 'POST', body: input, token }),
    onSuccess: () => {
      setDeclining(null);
      setNote('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['my-parts', token] });
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Could not save that response'),
  });

  if (!token) return <Navigate to="/musician/sign-in" replace />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Your parts</h1>
        <p className="hint">Accept what you can play, and tell your director if you cannot.</p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {parts.data?.assignments.map((assignment) => (
        <div key={assignment.id} className="card space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">
                {assignment.instrumentName} {assignment.partLabel}
              </p>
              <p className="hint">
                {assignment.songTitle}
                {assignment.seasonName ? ` · ${assignment.seasonName}` : ''} · {assignment.difficulty}
              </p>
              {assignment.note ? <p className="hint">Your note: {assignment.note}</p> : null}
            </div>
            {assignment.confirmation === 'pending' ? (
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  type="button"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate({ assignmentId: assignment.id, accepted: true })}
                >
                  Accept
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setDeclining(assignment.id);
                    setNote('');
                  }}
                >
                  Decline
                </button>
              </div>
            ) : (
              <span className={confirmationStyles[assignment.confirmation]}>
                {assignment.confirmation}
              </span>
            )}
          </div>

          {declining === assignment.id ? (
            <form
              className="space-y-2 border-t border-slate-100 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                confirm.mutate({
                  assignmentId: assignment.id,
                  accepted: false,
                  ...(note.trim() ? { note: note.trim() } : {}),
                });
              }}
            >
              <label className="label" htmlFor={`note-${assignment.id}`}>
                Why are you declining? (optional)
              </label>
              <textarea
                id={`note-${assignment.id}`}
                className="input"
                rows={2}
                maxLength={500}
                placeholder="Travelling that weekend, or the part is out of my range…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button className="btn-primary" type="submit" disabled={confirm.isPending}>
                  Send decline
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setDeclining(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ))}

      {parts.data?.assignments.length === 0 ? (
        <p className="hint">You have no parts yet. Your director will assign them soon.</p>
      ) : null}
    </div>
  );
}
