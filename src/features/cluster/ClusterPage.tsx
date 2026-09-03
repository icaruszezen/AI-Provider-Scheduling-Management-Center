import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useClusterStore, useNotificationStore } from '@/stores';
import type { ClusterRole } from '@/types/cluster';
import styles from './ClusterPage.module.scss';

// Mirrors config.MinClusterIntervalSeconds on the backend.
const MIN_CLUSTER_INTERVAL = 5;

const formatTime = (value?: string | null, locale?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
};

export function ClusterPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();
  const status = useClusterStore((state) => state.status);
  const nodes = useClusterStore((state) => state.nodes);
  const loading = useClusterStore((state) => state.loading);
  const fetchStatus = useClusterStore((state) => state.fetchStatus);
  const fetchNodes = useClusterStore((state) => state.fetchNodes);
  const syncNow = useClusterStore((state) => state.syncNow);
  const patch = useClusterStore((state) => state.patch);
  const removeNode = useClusterStore((state) => state.removeNode);

  const statusUnknown = useClusterStore((state) => state.statusUnknown);

  const [role, setRole] = useState<ClusterRole>('standalone');
  const [token, setToken] = useState('');
  const [masterUrl, setMasterUrl] = useState('');
  const [advertiseUrl, setAdvertiseUrl] = useState('');
  const [syncInterval, setSyncInterval] = useState('');
  const [heartbeatInterval, setHeartbeatInterval] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const connected = connectionStatus === 'connected';

  const refresh = useCallback(async () => {
    const next = await fetchStatus(true);
    if (next?.role === 'master') {
      await fetchNodes();
    }
  }, [fetchNodes, fetchStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status) return;
    setRole(status.role || 'standalone');
    setMasterUrl(status.master_url ?? '');
    setAdvertiseUrl(status.advertise_url ?? '');
    setSyncInterval(status.sync_interval_seconds ? String(status.sync_interval_seconds) : '');
    setHeartbeatInterval(
      status.heartbeat_interval_seconds ? String(status.heartbeat_interval_seconds) : ''
    );
    setToken('');
  }, [status]);

  useHeaderRefresh(refresh, connected);

  useEffect(() => {
    if (status?.role !== 'master' || !connected) return;
    const timer = window.setInterval(() => {
      void fetchNodes();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [connected, fetchNodes, status?.role]);

  const roleOptions = useMemo(
    () => [
      { value: 'standalone', label: t('cluster.role_standalone') },
      { value: 'master', label: t('cluster.role_master') },
      { value: 'slave', label: t('cluster.role_slave') },
    ],
    [t]
  );

  // An empty interval field means "use the server default", which the backend
  // expresses as 0.
  const parseInterval = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  };

  const handleSave = async () => {
    const sync = parseInterval(syncInterval);
    const heartbeat = parseInterval(heartbeatInterval);
    if (sync === undefined || heartbeat === undefined) {
      showNotification(t('cluster.interval_invalid', { min: MIN_CLUSTER_INTERVAL }), 'error');
      return;
    }
    setSaving(true);
    try {
      await patch({
        role,
        token: token.trim() ? token.trim() : undefined,
        master_url: masterUrl.trim(),
        advertise_url: advertiseUrl.trim(),
        sync_interval_seconds: sync,
        heartbeat_interval_seconds: heartbeat,
      });
      setToken('');
      showNotification(t('cluster.save_success'), 'success');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : t('common.unknown_error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const failed = await syncNow();
      if (failed > 0) {
        showNotification(t('cluster.sync_partial', { failed }), 'warning');
      } else {
        showNotification(t('cluster.sync_started'), 'success');
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : t('common.unknown_error'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleRemove = (nodeId: string) => {
    showConfirmation({
      title: t('cluster.remove_node_title'),
      message: t('cluster.remove_node_message', { id: nodeId }),
      variant: 'danger',
      onConfirm: async () => {
        try {
          await removeNode(nodeId);
          showNotification(t('cluster.remove_success'), 'success');
        } catch (error) {
          showNotification(
            error instanceof Error ? error.message : t('common.unknown_error'),
            'error'
          );
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('cluster.title')}</h1>
          <p className={styles.subtitle}>{t('cluster.subtitle')}</p>
        </div>
        {status?.role === 'master' ? (
          <Button onClick={() => void handleSync()} loading={syncing} disabled={!connected}>
            {t('cluster.sync_now')}
          </Button>
        ) : null}
      </header>

      <Card className={styles.card}>
        <h2 className={styles.cardTitle}>{t('cluster.local_settings')}</h2>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>{t('cluster.role')}</span>
            <Select
              value={role}
              options={roleOptions}
              onChange={(value) => setRole(value as ClusterRole)}
              disabled={!connected || saving}
              fullWidth
            />
          </label>
          <Input
            label={t('cluster.token')}
            type="password"
            value={token}
            placeholder={
              status?.token_configured ? t('cluster.token_configured') : t('cluster.token_placeholder')
            }
            onChange={(event) => setToken(event.target.value)}
            disabled={!connected || saving}
          />
          <Input
            label={t('cluster.node_id')}
            value={status?.node_id ?? ''}
            disabled
          />
          <Input
            label={t('cluster.applied_hash')}
            value={status?.applied_hash || '—'}
            disabled
          />
          <Input
            label={t('cluster.master_url')}
            value={masterUrl}
            placeholder="http://192.168.1.10:8317"
            onChange={(event) => setMasterUrl(event.target.value)}
            disabled={!connected || saving || role !== 'slave'}
          />
          <Input
            label={t('cluster.advertise_url')}
            value={advertiseUrl}
            placeholder="http://192.168.1.20:8317"
            onChange={(event) => setAdvertiseUrl(event.target.value)}
            disabled={!connected || saving || role !== 'slave'}
          />
          <Input
            label={t('cluster.sync_interval')}
            type="number"
            min={MIN_CLUSTER_INTERVAL}
            value={syncInterval}
            placeholder="30"
            hint={t('cluster.interval_hint', { min: MIN_CLUSTER_INTERVAL })}
            onChange={(event) => setSyncInterval(event.target.value)}
            disabled={!connected || saving || role !== 'slave'}
          />
          <Input
            label={t('cluster.heartbeat_interval')}
            type="number"
            min={MIN_CLUSTER_INTERVAL}
            value={heartbeatInterval}
            placeholder="15"
            hint={t('cluster.interval_hint', { min: MIN_CLUSTER_INTERVAL })}
            onChange={(event) => setHeartbeatInterval(event.target.value)}
            disabled={!connected || saving || role !== 'slave'}
          />
        </div>
        {statusUnknown ? <p className={styles.error}>{t('cluster.status_unknown')}</p> : null}
        {status?.last_error ? <p className={styles.error}>{status.last_error}</p> : null}
        <div className={styles.actions}>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!connected}>
            {t('common.save')}
          </Button>
        </div>
      </Card>

      {status?.role === 'slave' ? (
        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>{t('cluster.slave_status')}</h2>
          <dl className={styles.meta}>
            <div>
              <dt>{t('cluster.last_sync')}</dt>
              <dd>{formatTime(status.last_sync_at, i18n.language)}</dd>
            </div>
            <div>
              <dt>{t('cluster.master_url')}</dt>
              <dd>{status.master_url || '—'}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {status?.role === 'master' ? (
        <Card className={styles.card}>
          <h2 className={styles.cardTitle}>{t('cluster.nodes_title')}</h2>
          {nodes.length === 0 ? (
            <p className={styles.empty}>{loading ? t('common.loading') : t('cluster.nodes_empty')}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('cluster.col_node')}</th>
                    <th>{t('cluster.col_url')}</th>
                    <th>{t('cluster.col_version')}</th>
                    <th>{t('cluster.col_hash')}</th>
                    <th>{t('cluster.col_auths')}</th>
                    <th>{t('cluster.col_seen')}</th>
                    <th>{t('cluster.col_status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr key={node.node_id}>
                      <td>
                        <div className={styles.nodeId}>{node.node_id}</div>
                        <div className={styles.hostname}>{node.hostname || '—'}</div>
                      </td>
                      <td>{node.advertise_url || '—'}</td>
                      <td>{node.cpa_version || '—'}</td>
                      <td className={styles.hash}>{node.applied_hash || '—'}</td>
                      <td>{node.auth_file_count ?? 0}</td>
                      <td>{formatTime(node.last_seen, i18n.language)}</td>
                      <td>
                        <span className={styles.status} data-status={node.status || 'stale'}>
                          {t(`cluster.status_${node.status || 'stale'}`)}
                        </span>
                        {node.last_error ? <div className={styles.nodeError}>{node.last_error}</div> : null}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(node.node_id)}
                        >
                          {t('common.delete')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
