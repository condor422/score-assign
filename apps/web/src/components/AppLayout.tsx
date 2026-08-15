import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useSession } from '../auth/SessionContext';
import { TrialBanner } from './TrialBanner';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/program', label: 'Program' },
  { to: '/musicians', label: 'Musicians' },
  { to: '/assignments', label: 'Assignments' },
  { to: '/form', label: 'Intake form' },
  { to: '/billing', label: 'Plan' },
];

export function AppLayout(): JSX.Element {
  const { session, signOut } = useSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{session?.tenant.name}</p>
            <p className="text-xs text-slate-500">
              {session?.tenant.slug}.scoreassign.com · {session?.user.role}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-4 pb-2 text-sm">
          {navItems.map((item) => (
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
