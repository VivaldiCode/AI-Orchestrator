import { Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AuthScreen } from './pages/AuthScreen';
import { OverviewPage } from './pages/Overview';
import { NodesPage } from './pages/Nodes';
import { ProvidersPage } from './pages/Providers';
import { AnalyticsPage } from './pages/Analytics';
import { ApiKeysPage } from './pages/ApiKeys';
import { SettingsPage } from './pages/Settings';

export function App() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading…" />
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
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<OverviewPage />} />
      </Route>
    </Routes>
  );
}
