import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useMusicianSession } from '../../auth/MusicianSession';
import type { MusicianProfile } from '../../lib/types';

/** A musician sees their own contact details here, and nobody else's. */
export function MusicianProfilePage(): JSX.Element {
  const { token } = useMusicianSession();

  const profile = useQuery({
    queryKey: ['musician-profile', token],
    queryFn: () => api<MusicianProfile>('/musician/profile', { token }),
    enabled: Boolean(token),
  });

  if (!token) return <Navigate to="/musician/sign-in" replace />;

  const musician = profile.data?.musician;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Your details</h1>
        <p className="hint">
          Ask your director to update these — they came from your registration form.
        </p>
      </header>

      <dl className="card grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="label">Name</dt>
          <dd>{musician?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="label">Email</dt>
          <dd>{musician?.email ?? '—'}</dd>
        </div>
        <div>
          <dt className="label">Phone</dt>
          <dd>{musician?.phone ?? '—'}</dd>
        </div>
        <div>
          <dt className="label">Willing to double</dt>
          <dd>
            {musician?.willingToDouble === null || musician?.willingToDouble === undefined
              ? '—'
              : musician.willingToDouble
                ? 'Yes'
                : 'No'}
          </dd>
        </div>
        <div>
          <dt className="label">Experience</dt>
          <dd>{musician?.experienceLevel ?? '—'}</dd>
        </div>
        <div>
          <dt className="label">Difficulty preference</dt>
          <dd>{musician?.difficultyPreference ?? '—'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="label">Instruments, most preferred first</dt>
          <dd>
            {musician?.instruments.length
              ? musician.instruments.map((i) => i.instrumentName).join(' → ')
              : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
