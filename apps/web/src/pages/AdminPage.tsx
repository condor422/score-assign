import { Navigate, NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useSession } from '../auth/SessionContext';
import type { Capability } from '../lib/types';

/**
 * Configuration lives here rather than in the top-level nav: instrumentation,
 * musician records, the intake form, teammates and the organisation profile.
 * Each tab carries its own capability, so a director sees the form builder and
 * nothing else while an owner sees everything.
 */
const tabs: { to: string; label: string; capability: Capability }[] = [
  { to: 'instruments', label: 'Instruments', capability: 'settings.manage' },
  { to: 'musicians', label: 'Musicians', capability: 'settings.manage' },
  { to: 'form', label: 'Intake form', capability: 'form.write' },
  { to: 'team', label: 'Team', capability: 'team.manage' },
  { to: 'organization', label: 'Organization', capability: 'settings.manage' },
];

export function AdminPage(): JSX.Element {
  const { can } = useSession();
  const visible = tabs.filter((tab) => can(tab.capability));

  if (visible.length === 0) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Administration</h1>
        <p className="hint">Configure how this workspace behaves for everyone in it.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-maroon-100 pb-2">
        {visible.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => clsx(isActive ? 'tab-active' : 'tab')}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

/** Sends each role to the first tab it is actually allowed to open. */
export function AdminIndexRedirect(): JSX.Element {
  const { can } = useSession();
  const first = tabs.find((tab) => can(tab.capability));
  return <Navigate to={first ? `/admin/${first.to}` : '/'} replace />;
}
