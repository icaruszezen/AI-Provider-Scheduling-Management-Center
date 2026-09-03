import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_PROVIDER_RETRY_STATUS_CODES,
  MAX_PROVIDER_RETRY_COUNT,
} from '@/utils/providerRetry';
import styles from './sharedForm.module.scss';

interface ProviderRetryFieldsProps {
  count?: number;
  statusCodesText?: string;
  mutating: boolean;
  onCountChange: (value: number | undefined) => void;
  onStatusCodesChange: (value: string) => void;
}

export function ProviderRetryFields({
  count,
  statusCodesText,
  mutating,
  onCountChange,
  onStatusCodesChange,
}: ProviderRetryFieldsProps) {
  const { t } = useTranslation();
  const fid = useId();
  const defaultCodes = DEFAULT_PROVIDER_RETRY_STATUS_CODES.join(', ');

  return (
    <div className={styles.fieldRow}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${fid}-retry-count`}>
          {t('providersPage.form.providerRetryCount')}
        </label>
        <input
          id={`${fid}-retry-count`}
          type="number"
          min={0}
          max={MAX_PROVIDER_RETRY_COUNT}
          step="1"
          className={styles.input}
          value={count ?? ''}
          placeholder="0"
          disabled={mutating}
          onChange={(event) =>
            onCountChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
        />
        <span className={styles.labelHint}>
          {t('providersPage.form.providerRetryCountHint', { max: MAX_PROVIDER_RETRY_COUNT })}
        </span>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${fid}-retry-codes`}>
          {t('providersPage.form.providerRetryStatusCodes')}
        </label>
        <input
          id={`${fid}-retry-codes`}
          className={styles.input}
          value={statusCodesText ?? ''}
          placeholder={defaultCodes}
          disabled={mutating}
          onChange={(event) => onStatusCodesChange(event.target.value)}
        />
        <span className={styles.labelHint}>
          {t('providersPage.form.providerRetryStatusCodesHint', { default: defaultCodes })}
        </span>
      </div>
    </div>
  );
}
