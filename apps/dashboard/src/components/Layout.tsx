import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useRealtimeConnection } from '../lib/realtime';
import { useRealtimeStore } from '../lib/store';
import { Logo } from './Logo';
import { cn } from './ui';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/nodes', label: 'Nodes', end: false },
  { to: '/providers', label: 'Providers', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/api-keys', label: 'API Keys', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function Layout() {
  useRealtimeConnection();
  const connected = useRealtimeStore((s) => s.connected);
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-8 flex items-center gap-2">
          <Logo size={36} />
          <div>
            <div className="text-sm font-semibold text-slate-100">AI Orchestrator</div>
            <div className="text-xs text-slate-500">conducted by Vivaldi</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-concert-600/20 text-concert-100'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 text-xs text-slate-500">
          <div className="mb-2 flex items-center gap-2" data-testid="realtime-status">
            <span
              className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-slate-600')}
            />
            {connected ? 'Live' : 'Offline'}
          </div>
          <div className="truncate text-slate-400">{user?.username}</div>
          <button onClick={logout} className="mt-1 text-rose-400 hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
