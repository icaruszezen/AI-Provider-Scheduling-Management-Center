import { useTranslation } from 'react-i18next';
import type { ProviderRecentUsageMap } from '@/components/providers/utils';
import { summarizeResourceConnectionCapacity } from '../connectionCapacity';
import type { ProviderResource } from '../types';

interface ChannelConnectionCapacityProps {
  resource: ProviderResource;
  usageByProvider?: ProviderRecentUsageMap;
  className?: string;
}

export function ChannelConnectionCapacity({
  resource,
  usageByProvider,
  className,
}: ChannelConnectionCapacityProps) {
  const { t } = useTranslation();
  const summary = summarizeResourceConnectionCapacity(resource, usageByProvider);
  const label = summary.unlimited
    ? t('providersPage.table.connectionsUnlimited')
    : t('providersPage.table.connectionsAvailable', {
        available: summary.available,
        max: summary.max,
      });

  return <span className={className}>{label}</span>;
}
