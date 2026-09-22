import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import {
  channelMonitorApi,
  type MonitorErrors,
  type MonitorModels,
  type MonitorSnapshot,
} from '@/services/api';
import {
  collectResourceAuthIndexes,
  formatMs,
  formatRatio,
  MONITOR_RANGES,
  type MonitorRange,
} from '../channelMonitorView';
import type { ProviderResource } from '../types';
import styles from './ChannelMonitorDialog.module.scss';

interface ChannelMonitorDialogProps {
  resource: ProviderResource | null;
  onClose: () => void;
}

export function ChannelMonitorDialog({ resource, onClose }: ChannelMonitorDialogProps) {
  const { t } = useTranslation();
  const authIndexes = useMemo(
    () => (resource ? collectResourceAuthIndexes(resource) : []),
    [resource]
  );
  const [range, setRange] = useState<MonitorRange>('90m');
  const [selectedAuth, setSelectedAuth] = useState('');
  const activeIndexes = useMemo(
    () => (selectedAuth ? [selectedAuth] : authIndexes),
    [authIndexes, selectedAuth]
  );
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [models, setModels] = useState<MonitorModels | null>(null);
  const [errors, setErrors] = useState<MonitorErrors | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRange('90m');
    setSelectedAuth('');
  }, [resource?.id]);

  useEffect(() => {
    if (!resource) return;
    if (activeIndexes.length === 0) {
      setSnapshot(null);
      setModels(null);
      setErrors(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void Promise.all([
      channelMonitorApi.snapshot(range, activeIndexes),
      channelMonitorApi.models(range, activeIndexes),
      channelMonitorApi.errors(range, activeIndexes),
    ])
      .then(([nextSnapshot, nextModels, nextErrors]) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        setModels(nextModels);
        setErrors(nextErrors);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeIndexes, range, resource]);

  const title = resource?.name || resource?.apiKeyPreview || resource?.identifier || t('providersPage.channelMonitor.title');
  const scoredSuccess =
    snapshot && snapshot.metrics.request_count > 0 ? 1 - snapshot.metrics.error_rate : undefined;

  return (
    <Modal open={resource !== null} title={t('providersPage.channelMonitor.title')} onClose={onClose} width={840}>
      <div className={styles.body}>
        <div className={styles.toolbar}>
          <strong>{title}</strong>
          <div className={styles.ranges} role="group" aria-label={t('providersPage.channelMonitor.trend')}>
            {MONITOR_RANGES.map((item) => (
              <button
                key={item}
                type="button"
                className={item === range ? styles.rangeActive : styles.range}
                onClick={() => setRange(item)}
              >
                {t(`providersPage.channelMonitor.ranges.${item}`)}
              </button>
            ))}
          </div>
          {authIndexes.length > 1 ? (
            <Select
              value={selectedAuth}
              ariaLabel={t('providersPage.channelMonitor.authAll')}
              options={[
                { value: '', label: t('providersPage.channelMonitor.authAll') },
                ...authIndexes.map((authIndex) => ({ value: authIndex, label: authIndex })),
              ]}
              onChange={setSelectedAuth}
            />
          ) : null}
        </div>

        {authIndexes.length === 0 ? <p>{t('providersPage.channelMonitor.empty')}</p> : null}
        {loading ? <p>{t('common.loading')}</p> : null}
        {failed ? <p>{t('providersPage.channelMonitor.loadFailed')}</p> : null}
        {snapshot && !snapshot.enabled ? <p>{t('providersPage.channelMonitor.disabled')}</p> : null}
        {snapshot?.coverage && snapshot.coverage.coverage_complete === false ? (
          <p>{t('providersPage.channelMonitor.coveragePartial')}</p>
        ) : null}

        {snapshot ? (
          <div className={styles.kpis}>
            <Kpi label={t('providersPage.channelMonitor.kpi.successRate')} value={scoredSuccess === undefined ? '—' : formatRatio(scoredSuccess)} tone={snapshot.health.overall} />
            <Kpi label={t('providersPage.channelMonitor.kpi.ttft')} value={formatMs(snapshot.metrics.ttft?.p50_ms)} tone={snapshot.health.overall} />
            <Kpi label={t('providersPage.channelMonitor.kpi.cache')} value={formatRatio(snapshot.metrics.cache_rate)} tone={snapshot.health.overall} />
            <Kpi label={t('providersPage.channelMonitor.kpi.rpm')} value={Math.round(snapshot.metrics.rpm).toString()} tone={snapshot.health.overall} />
            <Kpi label={t('providersPage.channelMonitor.kpi.tpm')} value={Math.round(snapshot.metrics.tpm).toString()} tone={snapshot.health.overall} />
          </div>
        ) : null}

        {snapshot && snapshot.metrics.request_count === 0 && !loading ? (
          <p>{t('providersPage.channelMonitor.empty')}</p>
        ) : null}

        {snapshot && snapshot.trend.length > 0 ? (
          <section>
            <h3 className={styles.sectionTitle}>{t('providersPage.channelMonitor.trend')}</h3>
            <div className={styles.trend}>
              {snapshot.trend.map((point) => {
                const total = point.metrics.success_requests + point.metrics.error_requests;
                const height = total === 0 ? 8 : Math.max(8, Math.round((1 - point.metrics.error_rate) * 48));
                return (
                  <span
                    key={point.bucket_start}
                    className={`${styles.bar} ${healthClass(point.health.overall)}`}
                    style={{ height }}
                    title={`${point.bucket_start} ${point.metrics.success_requests}/${point.metrics.error_requests}`}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {models && models.items.length > 0 ? (
          <section>
            <h3 className={styles.sectionTitle}>{t('providersPage.channelMonitor.models')}</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('providersPage.channelMonitor.models')}</th>
                  <th>{t('providersPage.channelMonitor.requests')}</th>
                  <th>{t('providersPage.channelMonitor.kpi.successRate')}</th>
                  <th>{t('providersPage.channelMonitor.kpi.ttft')}</th>
                </tr>
              </thead>
              <tbody>
                {models.items.map((item) => (
                  <tr key={`${item.auth_index}:${item.model}`}>
                    <td>{item.model}</td>
                    <td>{item.metrics.request_count}</td>
                    <td>{formatRatio(1 - item.metrics.error_rate)}</td>
                    <td>{formatMs(item.metrics.ttft?.p50_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section>
          <h3 className={styles.sectionTitle}>{t('providersPage.channelMonitor.errors')}</h3>
          {!errors || errors.items.length === 0 ? (
            <p>{t('providersPage.channelMonitor.noErrors')}</p>
          ) : (
            <ul className={styles.errors}>
              {errors.items.map((item) => (
                <li key={item.category}>
                  <span>{item.category}</span>
                  <span>{item.count}</span>
                  <span>{formatRatio(item.rate)}</span>
                  {item.ignored ? <em>{t('providersPage.channelMonitor.ignored')}</em> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

function healthClass(tone: string): string {
  if (tone === 'healthy') return styles.healthy;
  if (tone === 'warning') return styles.warning;
  if (tone === 'critical') return styles.critical;
  return styles.unknown;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={styles.kpi}>
      <span className={`${styles.dot} ${healthClass(tone)}`} />
      <span className={styles.kpiLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
