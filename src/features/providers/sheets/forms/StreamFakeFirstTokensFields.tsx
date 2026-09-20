import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlus, IconX } from '@/components/ui/icons';
import {
  formatStreamFakeFirstTokenChip,
  MAX_STREAM_FAKE_FIRST_TOKENS,
  sanitizeStreamFakeFirstTokens,
} from '@/utils/streamFakeFirstTokens';
import styles from './sharedForm.module.scss';

interface StreamFakeFirstTokensFieldsProps {
  tokens: string[];
  mutating: boolean;
  onChange: (tokens: string[]) => void;
}

export function StreamFakeFirstTokensFields({
  tokens,
  mutating,
  onChange,
}: StreamFakeFirstTokensFieldsProps) {
  const { t } = useTranslation();
  const fid = useId();
  const [draft, setDraft] = useState('');
  const sanitized = sanitizeStreamFakeFirstTokens(tokens);

  const commitToken = (raw: string) => {
    onChange(sanitizeStreamFakeFirstTokens([...sanitized, raw]));
    setDraft('');
  };

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`${fid}-fake-token`}>
        {t('providersPage.form.streamFakeFirstTokens')}
      </label>
      {sanitized.length ? (
        <div className={styles.chipList}>
          {sanitized.map((token) => (
            <span key={JSON.stringify(token)} className={styles.chip}>
              <span className={styles.chipLabel}>{formatStreamFakeFirstTokenChip(token)}</span>
              <button
                type="button"
                className={styles.chipRemove}
                disabled={mutating}
                aria-label={t('common.delete')}
                onClick={() => onChange(sanitized.filter((item) => item !== token))}
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.chipInputRow}>
        <input
          id={`${fid}-fake-token`}
          className={styles.input}
          value={draft}
          disabled={mutating || sanitized.length >= MAX_STREAM_FAKE_FIRST_TOKENS}
          placeholder={t('providersPage.form.streamFakeFirstTokensPlaceholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }
            event.preventDefault();
            if (draft.length === 0) {
              return;
            }
            commitToken(draft);
          }}
        />
        <button
          type="button"
          className={styles.addBtn}
          disabled={mutating || draft.length === 0 || sanitized.length >= MAX_STREAM_FAKE_FIRST_TOKENS}
          onClick={() => commitToken(draft)}
        >
          <IconPlus size={14} />
          <span>{t('providersPage.form.streamFakeFirstTokensAdd')}</span>
        </button>
        <button
          type="button"
          className={styles.addBtn}
          disabled={mutating || sanitized.includes(' ') || sanitized.length >= MAX_STREAM_FAKE_FIRST_TOKENS}
          onClick={() => commitToken(' ')}
        >
          <span>{t('providersPage.form.streamFakeFirstTokensAddSpace')}</span>
        </button>
      </div>
      <span className={styles.labelHint}>{t('providersPage.form.streamFakeFirstTokensHint')}</span>
    </div>
  );
}
