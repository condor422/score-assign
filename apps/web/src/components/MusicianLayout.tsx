import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useMusicianSession } from '../auth/MusicianSession';
import type { MusicianProfile } from '../lib/types';

const navItems = [
  { to: '/musician/parts', label: 'My parts' },
  { to: '/musician/profile', label: 'My details' },
];

/** Tenant header for musician-facing pages, without any director navigation. */
export function MusicianLayout(): JSX.Element {
  const { token, signOut } = useMusicianSession();
  const location = useLocation();
  const signedIn = Boolean(token);

  const profile = useQuery({
    queryKey: ['musician-profile', token],
    queryFn: () => api<MusicianProfile>('/musician/profile', { token }),
    enabled: signedIn,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{profile.data?.tenant.name ?? 'ScoreAssign'}</p>
            <p className="text-xs text-slate-500">
              {profile.data ? profile.data.musician.name : 'Musician portal'}
            </p>
          </div>
          {signedIn ? (
            <button type="button" className="btn-secondary" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
        {signedIn ? (
          <nav className="mx-auto flex max-w-3xl gap-1 px-4 pb-2 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'rounded-md px-3 py-1.5',
                    isActive || location.pathname === item.to
                      ? 'bg-ink text-white'
                      : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
