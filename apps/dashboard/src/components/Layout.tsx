import { NavLink, Outlet } from 'react-router-dom';
import type { Permission } from '@ai-orchestrator/shared';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/en';
import { useRealtimeConnection } from '../lib/realtime';
import { useRealtimeStore } from '../lib/store';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { cn } from './ui';

const NAV: { to: string; key: TranslationKey; end: boolean; perm?: Permission }[] = [
  { to: '/', key: 'nav.overview', end: true },
  { to: '/nodes', key: 'nav.nodes', end: false, perm: 'nodes:read' },
  { to: '/providers', key: 'nav.providers', end: false, perm: 'providers:read' },
  { to: '/playground', key: 'nav.playground', end: false, perm: 'providers:read' },
  { to: '/mcp', key: 'nav.mcp', end: false, perm: 'providers:read' },
  { to: '/skills', key: 'nav.skills', end: false, perm: 'providers:read' },
  { to: '/analytics', key: 'nav.analytics', end: false, perm: 'analytics:read' },
  { to: '/debug', key: 'nav.debug', end: false, perm: 'analytics:read' },
  { to: '/api-keys', key: 'nav.apiKeys', end: false, perm: 'apikeys:read' },
  { to: '/users', key: 'nav.users', end: false, perm: 'users:read' },
  { to: '/authentication', key: 'nav.auth', end: false, perm: 'users:write' },
  { to: '/settings', key: 'nav.settings', end: false, perm: 'settings:read' },
  { to: '/help', key: 'nav.docs', end: false },
];

export function Layout() {
  useRealtimeConnection();
  const connected = useRealtimeStore((s) => s.connected);
  const { user, logout } = useAuth();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-8 flex items-center gap-2">
          <Logo size={36} />
          <div>
            <div className="text-sm font-semibold text-slate-100">{t('app.name')}</div>
            <div className="text-xs text-slate-500">{t('app.tagline')}</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.filter(
            (item) => !item.perm || (user?.permissions?.includes(item.perm) ?? false),
          ).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-concert-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                )
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3 pt-4 text-xs text-slate-500">
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2" data-testid="realtime-status">
            <span
              className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-slate-600')}
            />
            {connected ? t('common.live') : t('common.offline')}
          </div>
          <div>
            <div className="truncate text-slate-400">{user?.username}</div>
            <button onClick={logout} className="mt-1 text-rose-400 hover:underline">
              {t('common.signOut')}
            </button>
          </div>
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
