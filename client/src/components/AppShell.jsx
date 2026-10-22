import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useLive } from '../store/live';
import { Avatar, cx } from './ui';
import Brand from './Brand';
import { Hospital, Bell, Logout } from '../lib/icons';

const NAV = [
  { to: '/station', label: 'Ward board', icon: Hospital, end: true },
  { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'open' },
];

/** Chrome for a nurse or doctor at the monitoring station. */
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const openAlerts = useLive((s) => s.alerts.filter((a) => a.status === 'open').length);

  const badge = (kind) => (kind === 'open' && openAlerts ? openAlerts : null);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-hairline bg-surface/60 p-6 lg:flex">
        <Brand to="/station" />

        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end, badge: kind }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold transition',
                  isActive ? 'bg-ink text-white' : 'text-muted hover:bg-sunken hover:text-ink',
                )
              }
            >
              <Icon size={18} />
              {label}
              {badge(kind) && (
                <span className="ml-auto rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                  {badge(kind)}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="rounded-tile bg-sunken p-3">
          <div className="flex items-center gap-3">
            <Avatar src={user?.avatar} name={user?.name} size={38} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user?.name}</p>
              <p className="truncate text-[12px] capitalize text-muted">
                {user?.role} · {user?.wards?.join(', ') || 'no ward'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-surface py-2 text-[13px] font-semibold text-muted transition hover:text-ink"
          >
            <Logout size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hairline bg-canvas/85 px-5 py-3 backdrop-blur lg:hidden">
          <Brand to="/station" />
          <button onClick={logout} className="rounded-full p-2 text-muted">
            <Logout size={20} />
          </button>
        </header>

        {/* Wider than the homecare container: a ward board is a grid of tiles a
            nurse scans at a glance, not a reading column. */}
        <main className="mx-auto w-full max-w-7xl px-5 pb-28 pt-6 lg:px-10 lg:pb-16 lg:pt-10">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-hairline bg-surface/95 backdrop-blur lg:hidden">
          {NAV.map(({ to, label, icon: Icon, end, badge: kind }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-semibold transition',
                  isActive ? 'text-ink' : 'text-muted',
                )
              }
            >
              <Icon size={20} />
              {label}
              {badge(kind) && (
                <span className="absolute right-1/4 top-2 h-2 w-2 rounded-full bg-danger" />
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
