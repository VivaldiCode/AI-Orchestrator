import { Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useI18n } from './i18n';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AuthScreen } from './pages/AuthScreen';
import { OverviewPage } from './pages/Overview';
import { NodesPage } from './pages/Nodes';
import { ProvidersPage } from './pages/Providers';
import { AnalyticsPage } from './pages/Analytics';
import { ApiKeysPage } from './pages/ApiKeys';
import { SettingsPage } from './pages/Settings';
import { UsersPage } from './pages/Users';
import { DocsPage } from './pages/Docs';

export function App() {
  const { status } = useAuth();
  const { t } = useI18n();

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (status === 'needsSetup') return <AuthScreen mode="setup" />;
  if (status === 'unauthenticated') return <AuthScreen mode="login" />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="nodes" element={<NodesPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<DocsPage />} />
        <Route path="*" element={<OverviewPage />} />
      </Route>
    </Routes>
  );
}
