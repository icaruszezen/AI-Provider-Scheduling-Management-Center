import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { generateSecureApiKey } from '@/utils/apiKey';
import {
  MAX_CHANNEL_RETRY_COUNT,
  parseLines,
  parseStatusCodes,
  validateChannelGroupSettings,
  type ChannelGroupSettings,
} from '../channelGroups';
import styles from '../sheets/forms/sharedForm.module.scss';

interface ChannelGroupSettingsDialogProps {
  group: ChannelGroupSettings | null;
  mutating?: boolean;
  onClose: () => void;
  onSave: (settings: ChannelGroupSettings) => Promise<void>;
}

export function ChannelGroupSettingsDialog({
  group,
  mutating,
  onClose,
  onSave,
}: ChannelGroupSettingsDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [apiKeysText, setApiKeysText] = useState(() => group?.apiKeys.join('\n') ?? '');
  const [retryCountText, setRetryCountText] = useState(() =>
    group?.channelRetryCount === undefined ? '' : String(group.channelRetryCount)
  );
  const [statusCodesText, setStatusCodesText] = useState(
    () => group?.channelRetryStatusCodes.join(', ') ?? ''
  );
  const [errorText, setErrorText] = useState(
    () => group?.channelRetryErrorContains.join('\n') ?? ''
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const appendGeneratedKey = () => {
    const key = generateSecureApiKey();
    setApiKeysText((current) => {
      const trimmed = current.replace(/\s+$/, '');
      return trimmed ? `${trimmed}\n${key}` : key;
    });
    setErrorMessage(null);
  };

  const submit = async () => {
    if (!group) return;
    const retryCount = retryCountText.trim();
    const settings: ChannelGroupSettings = {
      name: group.name,
      apiKeys: parseLines(apiKeysText),
      channelRetryCount: retryCount === '' ? undefined : Number(retryCount),
      channelRetryStatusCodes: parseStatusCodes(statusCodesText),
      channelRetryErrorContains: parseLines(errorText),
    };
    const invalid = validateChannelGroupSettings(settings);
    if (invalid) {
      setErrorMessage(t(`providersPage.groups.settings.errors.${invalid}`));
      return;
    }
    setErrorMessage(null);
    try {
      await onSave(settings);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message || t('providersPage.groups.saveFailed'));
    }
  };

  return (
    <Modal
      open={group !== null}
      title={t('providersPage.groups.settings.title', { name: group?.name ?? '' })}
      onClose={onClose}
      closeDisabled={mutating}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutating}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={mutating} disabled={!group || mutating}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className={styles.sectionDesc}>{t('providersPage.groups.settings.description')}</p>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor={`${formId}-keys`}>
              {t('providersPage.groups.settings.apiKeys')}
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={appendGeneratedKey}
              disabled={mutating}
            >
              {t('providersPage.groups.settings.generateKey')}
            </Button>
          </div>
          <textarea
            id={`${formId}-keys`}
            className={styles.textarea}
            value={apiKeysText}
            disabled={mutating}
            spellCheck={false}
            onChange={(event) => setApiKeysText(event.target.value)}
          />
          <span className={styles.labelHint}>{t('providersPage.groups.settings.apiKeysHint')}</span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${formId}-retry`}>
            {t('providersPage.groups.settings.retryCount')}
          </label>
          <input
            id={`${formId}-retry`}
            className={styles.input}
            type="number"
            min={0}
            max={MAX_CHANNEL_RETRY_COUNT}
            step={1}
            value={retryCountText}
            placeholder="0"
            disabled={mutating}
            onChange={(event) => setRetryCountText(event.target.value)}
          />
          <span className={styles.labelHint}>
            {t('providersPage.groups.settings.retryCountHint', { max: MAX_CHANNEL_RETRY_COUNT })}
          </span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${formId}-codes`}>
            {t('providersPage.groups.settings.statusCodes')}
          </label>
          <input
            id={`${formId}-codes`}
            className={styles.input}
            value={statusCodesText}
            disabled={mutating}
            onChange={(event) => setStatusCodesText(event.target.value)}
          />
          <span className={styles.labelHint}>
            {t('providersPage.groups.settings.statusCodesHint')}
          </span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${formId}-errors`}>
            {t('providersPage.groups.settings.errorText')}
          </label>
          <textarea
            id={`${formId}-errors`}
            className={styles.textarea}
            value={errorText}
            disabled={mutating}
            onChange={(event) => setErrorText(event.target.value)}
          />
          <span className={styles.labelHint}>
            {t('providersPage.groups.settings.errorTextHint')}
          </span>
        </div>
        {errorMessage ? <div className={styles.errorBox}>{errorMessage}</div> : null}
      </form>
    </Modal>
  );
}
