import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useDevices } from '../store/device';
import { cx } from './ui';
import Brand from './Brand';
import { Home, Sliders, Logout } from '../lib/icons';

const NAV = [
  { to: '/home', label: 'Monitoring', icon: Home, end: true },
  { to: '/home/dev', label: 'Simulator', icon: Sliders },
];

/**
 * Chrome for the patient's kiosk.
 *
 * This screen sits on a table in someone's living room and is looked at from
 * across the room, if at all — so everything is a size up from the staff shell
 * and the nav is two items rather than seven.
 */
export default function PatientShell({ children }) {
  const { user, logout } = useAuth();
  const startDevices = useDevices((s) => s.start);

  // Started here rather than on the monitoring page: the devices must run for
  // as long as the patient is signed in, whichever screen they happen to be
  // looking at. Tying it to a route would mean monitoring stopped the moment
  // they opened anything else.
  useEffect(() => {
    if (user?.patient) startDevices(user.patient);
  }, [user?.patient, startDevices]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hairline bg-canvas/85 px-6 py-4 backdrop-blur">
        <Brand to="/home" />
        <div className="flex items-center gap-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold transition',
                  isActive ? 'bg-ink text-white' : 'text-muted hover:bg-sunken hover:text-ink',
                )
              }
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
          <button
            onClick={logout}
            className="rounded-full p-3 text-muted transition hover:bg-sunken hover:text-ink"
            aria-label="Sign out"
          >
            <Logout size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 pb-16 pt-8">{children}</main>

      <p className="pb-8 text-center text-[13px] text-muted">
        Signed in as {user?.name}
      </p>
    </div>
  );
}
