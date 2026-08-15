import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useSession } from '../auth/SessionContext';
import { TrialBanner } from './TrialBanner';
import { roleLabels, type Capability } from '../lib/types';

/** `capability: null` means every signed-in role sees the item. */
const navItems: { to: string; label: string; capability: Capability | null }[] = [
  { to: '/', label: 'Overview', capability: null },
  { to: '/roster', label: 'Roster', capability: 'roster.read' },
  { to: '/program', label: 'Program', capability: 'program.write' },
  { to: '/musicians', label: 'Musicians', capability: 'roster.write' },
  { to: '/assignments', label: 'Assignments', capability: 'roster.read' },
  { to: '/form', label: 'Intake form', capability: 'form.write' },
  { to: '/team', label: 'Team', capability: 'team.manage' },
  { to: '/billing', label: 'Plan', capability: 'billing.manage' },
];

export function AppLayout(): JSX.Element {
  const { session, signOut, can } = useSession();
  const items = navItems.filter((item) => item.capability === null || can(item.capability));

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{session?.tenant.name}</p>
            <p className="text-xs text-slate-500">
              {session?.tenant.slug}.scoreassign.com ·{' '}
              {session ? roleLabels[session.user.role] : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session?.user.isPlatformAdmin ? (
              <NavLink className="btn-secondary" to="/platform">
                Platform
              </NavLink>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-4 pb-2 text-sm">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'rounded-md px-3 py-1.5',
                  isActive ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <TrialBanner />
        <Outlet />
      </main>
    </div>
  );
}
