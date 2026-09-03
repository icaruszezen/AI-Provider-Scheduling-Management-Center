import { useTranslation } from 'react-i18next';
import styles from './SlaveSyncBanner.module.scss';

export function SlaveSyncBanner() {
  const { t } = useTranslation();
  return (
    <div className={styles.banner} role="status">
      {t('cluster.slave_banner')}
    </div>
  );
}
