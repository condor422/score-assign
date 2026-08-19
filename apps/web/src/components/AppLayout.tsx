import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useSession } from '../auth/SessionContext';
import { TrialBanner } from './TrialBanner';
import { BrandMark } from './BrandMark';
import { roleLabels, type Capability } from '../lib/types';

/**
 * `capability: null` means every signed-in role sees the item. Configuration
 * lives behind one Admin entry; its own tabs are gated individually, so a
 * director still reaches the form builder without holding settings.manage.
 */
const navItems: { to: string; label: string; capabilities: Capability[] | null }[] = [
  { to: '/', label: 'Overview', capabilities: null },
  { to: '/roster', label: 'Roster', capabilities: ['roster.read'] },
  { to: '/program', label: 'Program', capabilities: ['program.write'] },
  { to: '/musicians', label: 'Musicians', capabilities: ['roster.write'] },
  { to: '/assignments', label: 'Assignments', capabilities: ['roster.read'] },
  { to: '/admin', label: 'Admin', capabilities: ['settings.manage', 'form.write', 'team.manage'] },
  { to: '/billing', label: 'Plan', capabilities: ['billing.manage'] },
];

export function AppLayout(): JSX.Element {
  const { session, signOut, can } = useSession();
  const items = navItems.filter(
    (item) => item.capabilities === null || item.capabilities.some((c) => can(c)),
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-maroon-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-sm font-semibold text-maroon-900">{session?.tenant.name}</p>
              <p className="text-xs text-slate-500">
                {session?.tenant.slug}.scoreassign.com ·{' '}
                {session ? roleLabels[session.user.role] : ''}
              </p>
            </div>
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
              className={({ isActive }) => clsx(isActive ? 'tab-active' : 'tab')}
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
