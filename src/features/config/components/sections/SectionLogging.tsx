import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CONFIG_TAB_ICONS, SECTION_INDEX_LABELS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { SectionCard } from '../SectionCard';
import { FieldAnchor, FieldGrid, FieldStack, ToggleRow } from '../fields/FieldPrimitives';
import { DebugToggle, LoggingToFileToggle } from '../fields/sharedFields';
import { getValidationMessage } from '../blocks/shared';

const Icon = CONFIG_TAB_ICONS.logging;

/** 03 日志与诊断：调试、商业模式（重启生效）、日志输出与使用统计。 */
export function SectionLogging({
  values,
  validationErrors,
  disabled,
  animateIn,
  onChange,
}: ConfigSectionProps) {
  const { t } = useTranslation();
  const logsMaxSizeError = getValidationMessage(t, validationErrors?.logsMaxTotalSizeMb);
  const errorLogsMaxFilesError = getValidationMessage(t, validationErrors?.errorLogsMaxFiles);
  const redisUsageQueueRetentionError = getValidationMessage(
    t,
    validationErrors?.redisUsageQueueRetentionSeconds
  );
  const refreshError = getValidationMessage(
    t,
    validationErrors?.channelMonitorRefreshIntervalSeconds
  );
  const minimumSampleError = getValidationMessage(t, validationErrors?.channelMonitorMinimumSample);
  const warningErrorRateError = getValidationMessage(
    t,
    validationErrors?.channelMonitorWarningErrorRate
  );
  const criticalErrorRateError = getValidationMessage(
    t,
    validationErrors?.channelMonitorCriticalErrorRate
  );
  const targetTtftError = getValidationMessage(t, validationErrors?.channelMonitorTargetTtftMs);
  const criticalTtftError = getValidationMessage(t, validationErrors?.channelMonitorCriticalTtftMs);
  const errorWeightError = getValidationMessage(t, validationErrors?.channelMonitorErrorWeight);
  const ttftWeightError = getValidationMessage(t, validationErrors?.channelMonitorTtftWeight);
  const cacheWeightError = getValidationMessage(t, validationErrors?.channelMonitorCacheWeight);

  return (
    <SectionCard
      indexLabel={SECTION_INDEX_LABELS.logging}
      icon={<Icon size={16} />}
      title={t('config_management.visual.sections.logging.title')}
      description={t('config_management.visual.sections.logging.description')}
      animateIn={animateIn}
    >
      <FieldStack>
        <FieldGrid>
          <DebugToggle values={values} disabled={disabled} onChange={onChange} />
          <FieldAnchor fieldId="commercialMode">
            <ToggleRow
              title={t('config_management.visual.sections.system.commercial_mode')}
              description={t('config_management.visual.sections.system.commercial_mode_desc')}
              checked={values.commercialMode}
              disabled={disabled}
              onChange={(commercialMode) => onChange({ commercialMode })}
            />
          </FieldAnchor>
          <LoggingToFileToggle values={values} disabled={disabled} onChange={onChange} />
        </FieldGrid>

        <FieldGrid>
          <FieldAnchor fieldId="logsMaxTotalSizeMb">
            <Input
              label={t('config_management.visual.sections.system.logs_max_size')}
              type="number"
              placeholder="0"
              value={values.logsMaxTotalSizeMb}
              onChange={(e) => onChange({ logsMaxTotalSizeMb: e.target.value })}
              disabled={disabled}
              error={logsMaxSizeError}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="errorLogsMaxFiles">
            <Input
              label={t('config_management.visual.sections.system.error_logs_max_files')}
              type="number"
              placeholder="10"
              value={values.errorLogsMaxFiles}
              onChange={(e) => onChange({ errorLogsMaxFiles: e.target.value })}
              disabled={disabled}
              error={errorLogsMaxFilesError}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="redisUsageQueueRetentionSeconds">
            <Input
              label={t('config_management.visual.sections.system.redis_usage_retention')}
              type="number"
              min={1}
              max={3600}
              placeholder="60"
              value={values.redisUsageQueueRetentionSeconds}
              onChange={(e) => onChange({ redisUsageQueueRetentionSeconds: e.target.value })}
              disabled={disabled}
              hint={t('config_management.visual.sections.system.redis_usage_retention_hint')}
              error={redisUsageQueueRetentionError}
            />
          </FieldAnchor>
        </FieldGrid>

        <FieldGrid>
          <FieldAnchor fieldId="usageStatisticsEnabled">
            <ToggleRow
              title={t('config_management.visual.sections.system.usage_statistics_enabled')}
              description={t(
                'config_management.visual.sections.system.usage_statistics_enabled_desc'
              )}
              checked={values.usageStatisticsEnabled}
              disabled={disabled}
              onChange={(usageStatisticsEnabled) => onChange({ usageStatisticsEnabled })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorEnabled">
            <ToggleRow
              title={t('config_management.visual.sections.logging.channel_monitor_enabled')}
              description={t('config_management.visual.sections.logging.channel_monitor_enabled_hint')}
              checked={values.channelMonitorEnabled}
              disabled={disabled}
              onChange={(channelMonitorEnabled) => onChange({ channelMonitorEnabled })}
            />
          </FieldAnchor>
        </FieldGrid>

        <FieldGrid>
          <FieldAnchor fieldId="channelMonitorRefreshIntervalSeconds">
            <span>
              {t('config_management.visual.sections.logging.channel_monitor_refresh')}
            </span>
            <Select
              value={values.channelMonitorRefreshIntervalSeconds}
              disabled={disabled}
              ariaLabel={t('config_management.visual.sections.logging.channel_monitor_refresh')}
              options={[
                {
                  value: '',
                  label: t('config_management.visual.sections.logging.channel_monitor_refresh_default'),
                },
                { value: '60', label: '60' },
                { value: '300', label: '300' },
              ]}
              onChange={(channelMonitorRefreshIntervalSeconds) =>
                onChange({ channelMonitorRefreshIntervalSeconds })
              }
            />
            {refreshError ? <span>{refreshError}</span> : null}
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorDatabasePath">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_database_path')}
              value={values.channelMonitorDatabasePath}
              disabled={disabled}
              hint={t('config_management.visual.sections.logging.channel_monitor_database_path_hint')}
              onChange={(event) => onChange({ channelMonitorDatabasePath: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorAuthIndexes">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_auth_indexes')}
              value={values.channelMonitorAuthIndexes}
              disabled={disabled}
              hint={t('config_management.visual.sections.logging.channel_monitor_auth_indexes_hint')}
              onChange={(event) => onChange({ channelMonitorAuthIndexes: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorProviders">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_providers')}
              value={values.channelMonitorProviders}
              disabled={disabled}
              hint={t('config_management.visual.sections.logging.channel_monitor_providers_hint')}
              onChange={(event) => onChange({ channelMonitorProviders: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorModels">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_models')}
              value={values.channelMonitorModels}
              disabled={disabled}
              hint={t('config_management.visual.sections.logging.channel_monitor_models_hint')}
              onChange={(event) => onChange({ channelMonitorModels: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorIgnoredErrorCategories">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_ignored')}
              value={values.channelMonitorIgnoredErrorCategories}
              disabled={disabled}
              hint={t('config_management.visual.sections.logging.channel_monitor_ignored_hint')}
              onChange={(event) =>
                onChange({ channelMonitorIgnoredErrorCategories: event.target.value })
              }
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorMinimumSample">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_minimum_sample')}
              value={values.channelMonitorMinimumSample}
              disabled={disabled}
              error={minimumSampleError}
              onChange={(event) => onChange({ channelMonitorMinimumSample: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorWarningErrorRate">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_warning_error_rate')}
              value={values.channelMonitorWarningErrorRate}
              disabled={disabled}
              error={warningErrorRateError}
              onChange={(event) => onChange({ channelMonitorWarningErrorRate: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorCriticalErrorRate">
            <Input
              label={t(
                'config_management.visual.sections.logging.channel_monitor_critical_error_rate'
              )}
              value={values.channelMonitorCriticalErrorRate}
              disabled={disabled}
              error={criticalErrorRateError}
              onChange={(event) =>
                onChange({ channelMonitorCriticalErrorRate: event.target.value })
              }
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorTargetTtftMs">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_target_ttft')}
              value={values.channelMonitorTargetTtftMs}
              disabled={disabled}
              error={targetTtftError}
              onChange={(event) => onChange({ channelMonitorTargetTtftMs: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorCriticalTtftMs">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_critical_ttft')}
              value={values.channelMonitorCriticalTtftMs}
              disabled={disabled}
              error={criticalTtftError}
              onChange={(event) => onChange({ channelMonitorCriticalTtftMs: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorErrorWeight">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_error_weight')}
              value={values.channelMonitorErrorWeight}
              disabled={disabled}
              error={errorWeightError}
              onChange={(event) => onChange({ channelMonitorErrorWeight: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorTtftWeight">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_ttft_weight')}
              value={values.channelMonitorTtftWeight}
              disabled={disabled}
              error={ttftWeightError}
              onChange={(event) => onChange({ channelMonitorTtftWeight: event.target.value })}
            />
          </FieldAnchor>
          <FieldAnchor fieldId="channelMonitorCacheWeight">
            <Input
              label={t('config_management.visual.sections.logging.channel_monitor_cache_weight')}
              value={values.channelMonitorCacheWeight}
              disabled={disabled}
              error={cacheWeightError}
              onChange={(event) => onChange({ channelMonitorCacheWeight: event.target.value })}
            />
          </FieldAnchor>
        </FieldGrid>
      </FieldStack>
    </SectionCard>
  );
}
