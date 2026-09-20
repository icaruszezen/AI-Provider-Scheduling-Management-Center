import { Navigate, useRoutes, type Location } from 'react-router-dom';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProvidersWorkbenchPage } from '@/features/providers/ProvidersWorkbenchPage';
import { PluginResourcePage } from '@/features/plugins/PluginResourcePage';
import { PluginsPage } from '@/features/plugins/PluginsPage';
import { PluginStorePage } from '@/features/plugins/PluginStorePage';
import { ConfigPage } from '@/features/config/ConfigPage';
import { ClusterPage } from '@/features/cluster/ClusterPage';
import { LogsPage } from '@/pages/LogsPage';
import { SystemPage } from '@/pages/SystemPage';
import { useAuthStore } from '@/stores';

const createMainRoutes = (supportsPlugin: boolean) => [
  { path: '/', element: <DashboardPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/settings', element: <Navigate to="/config" replace /> },
  { path: '/api-keys', element: <Navigate to="/config" replace /> },
  { path: '/ai-providers', element: <ProvidersWorkbenchPage /> },
  { path: '/ai-providers/*', element: <Navigate to="/ai-providers" replace /> },
  ...(supportsPlugin
    ? [
        { path: '/plugin-pages/:pluginId/:menuIndex', element: <PluginResourcePage /> },
        { path: '/plugins', element: <PluginsPage /> },
        { path: '/plugin-store', element: <PluginStorePage /> },
        { path: '/plugins/*', element: <Navigate to="/plugins" replace /> },
      ]
    : [
        { path: '/plugin-pages/*', element: <Navigate to="/" replace /> },
        { path: '/plugins/*', element: <Navigate to="/" replace /> },
        { path: '/plugin-store', element: <Navigate to="/" replace /> },
      ]),
  { path: '/config', element: <ConfigPage /> },
  { path: '/cluster', element: <ClusterPage /> },
  { path: '/logs', element: <LogsPage /> },
  { path: '/system', element: <SystemPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function MainRoutes({ location }: { location?: Location }) {
  const supportsPlugin = useAuthStore((state) => state.supportsPlugin);
  return useRoutes(createMainRoutes(supportsPlugin), location);
}
