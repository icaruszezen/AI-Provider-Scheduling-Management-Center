import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconExternalLink,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import { groupChannelResources } from '../channelIdentity';
import type { ChannelGroupSettings } from '../channelGroups';
import { ChannelGroupSettingsDialog } from './ChannelGroupSettingsDialog';
import type { ProviderRecentUsageMap } from '@/components/providers/utils';
import { PROVIDER_LOGOS } from '../brandLogos';
import { getKimiAffiliateUrl } from '../kimi';
import { getSponsorProviderDefinition } from '../sponsorDefinitions';
import type { MonitorSummaries } from '../channelMonitorView';
import type { ProviderGroup, ProviderResource } from '../types';
import { ProviderResourceTable } from './ProviderResourceTable';
import { ProviderResourceToolbar } from './ProviderResourceToolbar';
import type { ProviderSortBy, SortDir } from '../types';
import styles from './ProviderResourcePanel.module.scss';

export interface ProviderPanelControls {
  sortBy: ProviderSortBy;
  sortDir: SortDir;
  onSortBy: (value: ProviderSortBy) => void;
  onSortDir: (value: SortDir) => void;
  availableModels: ReadonlyArray<string>;
  selectedModels: ReadonlySet<string>;
  onSelectedModelsChange: (next: Set<string>) => void;
}

interface ProviderResourcePanelProps {
  group: ProviderGroup;
  filter: string;
  onFilterChange: (value: string) => void;
  filteredResources: ProviderResource[];
  selectedId: string | null;
  disableMutations?: boolean;
  usageByProvider?: ProviderRecentUsageMap;
  monitorSummaries?: MonitorSummaries | null;
  onOpenMonitor?: (resource: ProviderResource) => void;
  toolbarControls?: ProviderPanelControls;
  catalogGroups?: readonly ChannelGroupSettings[];
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onCopy?: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
  onCreate: () => void;
  onCreateGroup?: (name: string) => void;
  onRenameGroup?: (from: string, to: string) => void;
  onDeleteGroup?: (name: string) => void;
  onSaveGroup?: (settings: ChannelGroupSettings) => Promise<void>;
}

export function ProviderResourcePanel({
  group,
  filter,
  onFilterChange,
  filteredResources,
  selectedId,
  disableMutations,
  usageByProvider,
  monitorSummaries,
  onOpenMonitor,
  toolbarControls,
  catalogGroups = [],
  onView,
  onEdit,
  onCopy,
  onDelete,
  onToggleDisabled,
  onCreate,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onSaveGroup,
}: ProviderResourcePanelProps) {
  const { t, i18n } = useTranslation();
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [settingsGroup, setSettingsGroup] = useState<ChannelGroupSettings | null>(null);
  const sections = groupChannelResources(
    filteredResources,
    catalogGroups.map((group) => group.name),
    filter.trim().length > 0
  );
  const submitNewGroup = () => {
    const name = newGroupName.trim();
    if (!name || !onCreateGroup) return;
    onCreateGroup(name);
    setNewGroupName('');
  };
  const logo = PROVIDER_LOGOS[group.id];
  const providerTitle = t(`providersPage.providerNames.${group.id}`);
  const registrationUrl =
    group.id === 'kimi'
      ? getKimiAffiliateUrl(i18n.resolvedLanguage ?? i18n.language)
      : group.id === 'lmuAI'
        ? getSponsorProviderDefinition(group.id).affiliateUrl
        : null;
  const registrationLabel = t(
    group.id === 'kimi' ? 'providersPage.sponsor.registerNow' : 'providersPage.sponsor.registerLink'
  );
  const emptyText = t('providersPage.table.empty');
  const logoClassName = [
    styles.logo,
    logo?.themeSurface ? styles.logoThemeSurface : '',
    logo?.darkSrc ? styles.logoThemeLight : '',
    logo?.invertOnDark ? styles.logoInvertOnDark : '',
  ]
    .filter(Boolean)
    .join(' ');
  const darkLogoClassName = [
    styles.logo,
    logo?.themeSurface ? styles.logoThemeSurface : '',
    styles.logoThemeDark,
  ]
    .filter(Boolean)
    .join(' ');

  const titleContent = (
    <>
      {logo ? (
        <>
          <img src={logo.src} alt="" aria-hidden="true" className={logoClassName} />
          {logo.darkSrc ? (
            <img src={logo.darkSrc} alt="" aria-hidden="true" className={darkLogoClassName} />
          ) : null}
        </>
      ) : null}
      <h2 className={styles.title}>{providerTitle}</h2>
    </>
  );

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.titleArea}>
            <div className={styles.titleRow}>{titleContent}</div>
            {registrationUrl ? (
              <>
                <a
                  className={[
                    styles.sponsorLink,
                    styles.sponsorLinkEmphasis,
                    group.id === 'kimi' ? styles.sponsorLinkKimi : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  href={registrationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className={styles.sponsorLinkText}>{registrationLabel}</span>
                  <IconExternalLink className={styles.sponsorLinkIcon} size={14} />
                </a>
                {group.id === 'kimi' ? (
                  <p className={styles.kimiPromo}>{t('providersPage.sponsor.kimiPromo')}</p>
                ) : null}
              </>
            ) : null}
          </div>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={t('providersPage.table.filterPlaceholder')}
            />
          </div>
        </div>
        {toolbarControls ? (
          <div className={styles.headerToolbarRow}>
            <ProviderResourceToolbar
              key={group.id}
              sortBy={toolbarControls.sortBy}
              sortDir={toolbarControls.sortDir}
              onSortBy={toolbarControls.onSortBy}
              onSortDir={toolbarControls.onSortDir}
              availableModels={toolbarControls.availableModels}
              selectedModels={toolbarControls.selectedModels}
              onSelectedModelsChange={toolbarControls.onSelectedModelsChange}
            />
          </div>
        ) : null}
      </div>

      <form
        className={styles.groupBar}
        onSubmit={(event) => {
          event.preventDefault();
          submitNewGroup();
        }}
      >
        <input
          className={styles.groupInput}
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
          placeholder={t('providersPage.groups.namePlaceholder')}
          disabled={disableMutations}
          aria-label={t('providersPage.groups.namePlaceholder')}
        />
        <button type="submit" className={styles.groupAddButton} disabled={disableMutations}>
          <IconPlus size={14} />
          <span>{t('providersPage.groups.add')}</span>
        </button>
      </form>

      {filteredResources.length === 0 && filter.trim() ? (
        <div className={styles.empty}>{emptyText}</div>
      ) : filteredResources.length === 0 && catalogGroups.length === 0 ? (
        <div className={styles.empty}>
          <div>{emptyText}</div>
          <div className={styles.emptyAction}>
            <button type="button" className={styles.emptyActionButton} onClick={onCreate}>
              <IconPlus size={16} />
              <span>{t('providersPage.actions.new')}</span>
            </button>
          </div>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.id || 'ungrouped'} className={styles.groupSection}>
            <div className={styles.groupHeader}>
              {renamingGroup === section.id && section.id ? (
                <form
                  className={styles.groupRenameForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const next = renameValue.trim();
                    if (next && onRenameGroup) onRenameGroup(section.id, next);
                    setRenamingGroup(null);
                  }}
                >
                  <input
                    className={styles.groupInput}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    autoFocus
                    aria-label={t('providersPage.groups.rename')}
                  />
                  <button type="submit" className={styles.groupAddButton}>
                    {t('providersPage.actions.save')}
                  </button>
                </form>
              ) : (
                <h3 className={styles.groupTitle}>
                  {section.id || t('providersPage.groups.ungrouped')}
                  <span className={styles.groupCount}>{section.resources.length}</span>
                </h3>
              )}
              {section.id && renamingGroup !== section.id ? (
                <div className={styles.groupActions}>
                  <button
                    type="button"
                    className={styles.groupIconButton}
                    disabled={disableMutations}
                    aria-label={t('providersPage.groups.settings.open')}
                    onClick={() => {
                      const current = catalogGroups.find((group) => group.name === section.id);
                      setSettingsGroup(
                        current ?? {
                          name: section.id,
                          apiKeys: [],
                          channelRetryStatusCodes: [],
                          channelRetryErrorContains: [],
                        }
                      );
                    }}
                  >
                    <IconSettings size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.groupIconButton}
                    disabled={disableMutations}
                    aria-label={t('providersPage.groups.rename')}
                    onClick={() => {
                      setRenamingGroup(section.id);
                      setRenameValue(section.id);
                    }}
                  >
                    <IconPencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.groupIconButton}
                    disabled={disableMutations}
                    aria-label={t('providersPage.groups.delete')}
                    onClick={() => onDeleteGroup?.(section.id)}
                  >
                    <IconTrash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
            {section.resources.length ? (
              <ProviderResourceTable
                resources={section.resources}
                selectedId={selectedId}
                disableMutations={disableMutations}
                usageByProvider={usageByProvider}
                monitorSummaries={monitorSummaries}
                onOpenMonitor={onOpenMonitor}
                onView={onView}
                onEdit={onEdit}
                onCopy={onCopy}
                onDelete={onDelete}
                onToggleDisabled={onToggleDisabled}
              />
            ) : (
              <div className={styles.groupEmpty}>{t('providersPage.groups.empty')}</div>
            )}
          </section>
        ))
      )}
      <ChannelGroupSettingsDialog
        key={settingsGroup?.name ?? 'channel-group-settings'}
        group={settingsGroup}
        mutating={disableMutations}
        onClose={() => setSettingsGroup(null)}
        onSave={async (settings) => {
          if (!onSaveGroup) return;
          await onSaveGroup(settings);
        }}
      />
    </section>
  );
}
