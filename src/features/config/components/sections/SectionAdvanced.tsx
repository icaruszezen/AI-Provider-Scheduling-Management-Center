import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/components/ui/Collapsible';
import { Input } from '@/components/ui/Input';
import { CONFIG_TAB_ICONS, SECTION_INDEX_LABELS } from '../../constants';
import type { ConfigSectionProps } from '../../types';
import { SectionCard } from '../SectionCard';
import {
  Divider,
  FieldAnchor,
  FieldGrid,
  FieldGroup,
  FieldGroupHeading,
  FieldShell,
  FieldStack,
  ToggleRow,
} from '../fields/FieldPrimitives';
import { StringListEditor } from '../blocks/StringListEditor';

const Icon = CONFIG_TAB_ICONS.advanced;

/** 06 高级与实验：签名缓存、Claude/Codex 请求头默认值。 */
export function SectionAdvanced({ values, disabled, animateIn, onChange }: ConfigSectionProps) {
  const { t } = useTranslation();

  const handleAntigravitySensitiveWordsChange = useCallback(
    (antigravitySensitiveWords: string[]) => onChange({ antigravitySensitiveWords }),
    [onChange]
  );

  return (
    <SectionCard
      indexLabel={SECTION_INDEX_LABELS.advanced}
      icon={<Icon size={16} />}
      title={t('config_management.visual.sections.advanced.title')}
      description={t('config_management.visual.sections.advanced.description')}
      animateIn={animateIn}
    >
      <FieldStack>
        <Collapsible
          label={t('config_management.visual.sections.advanced.antigravity_title')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldAnchor fieldId="antigravitySensitiveWords">
              <FieldGroup
                title={t('config_management.visual.sections.system.antigravity_sensitive_words')}
                description={t(
                  'config_management.visual.sections.system.antigravity_sensitive_words_desc'
                )}
              >
                <FieldShell
                  label={t(
                    'config_management.visual.sections.system.antigravity_sensitive_words_label'
                  )}
                  hint={t(
                    'config_management.visual.sections.system.antigravity_sensitive_words_hint'
                  )}
                >
                  <StringListEditor
                    value={values.antigravitySensitiveWords}
                    disabled={disabled}
                    placeholder={t(
                      'config_management.visual.sections.system.antigravity_sensitive_words_placeholder'
                    )}
                    inputAriaLabel={t(
                      'config_management.visual.sections.system.antigravity_sensitive_words_label'
                    )}
                    onChange={handleAntigravitySensitiveWordsChange}
                  />
                </FieldShell>
              </FieldGroup>
            </FieldAnchor>

            <Divider />
            <FieldGroupHeading
              title={t('config_management.visual.sections.advanced.signature_title')}
            />
            <FieldGrid>
              <FieldAnchor fieldId="antigravitySignatureCacheEnabled">
                <ToggleRow
                  title={t('config_management.visual.sections.system.antigravity_signature_cache')}
                  description={t(
                    'config_management.visual.sections.system.antigravity_signature_cache_desc'
                  )}
                  checked={values.antigravitySignatureCacheEnabled}
                  disabled={disabled}
                  onChange={(antigravitySignatureCacheEnabled) =>
                    onChange({ antigravitySignatureCacheEnabled })
                  }
                />
              </FieldAnchor>
              <FieldAnchor fieldId="antigravitySignatureBypassStrict">
                <ToggleRow
                  title={t('config_management.visual.sections.system.antigravity_signature_strict')}
                  description={t(
                    'config_management.visual.sections.system.antigravity_signature_strict_desc'
                  )}
                  checked={values.antigravitySignatureBypassStrict}
                  disabled={disabled}
                  onChange={(antigravitySignatureBypassStrict) =>
                    onChange({ antigravitySignatureBypassStrict })
                  }
                />
              </FieldAnchor>
            </FieldGrid>
          </FieldStack>
        </Collapsible>

        <Collapsible
          label={t('config_management.visual.sections.headers.title')}
          hint={t('config_management.visual.sections.headers.description')}
          defaultOpen={false}
        >
          <FieldStack>
            <FieldGroupHeading
              title={t('config_management.visual.sections.headers.claude_title')}
            />
            <FieldGrid>
              <FieldAnchor fieldId="claudeHeaderUserAgent">
                <Input
                  label={t('config_management.visual.sections.headers.user_agent')}
                  placeholder="claude-cli/2.1.44 (external, sdk-cli)"
                  value={values.claudeHeaderUserAgent}
                  onChange={(e) => onChange({ claudeHeaderUserAgent: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderPackageVersion">
                <Input
                  label={t('config_management.visual.sections.headers.package_version')}
                  placeholder="0.74.0"
                  value={values.claudeHeaderPackageVersion}
                  onChange={(e) => onChange({ claudeHeaderPackageVersion: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderRuntimeVersion">
                <Input
                  label={t('config_management.visual.sections.headers.runtime_version')}
                  placeholder="v24.3.0"
                  value={values.claudeHeaderRuntimeVersion}
                  onChange={(e) => onChange({ claudeHeaderRuntimeVersion: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderOs">
                <Input
                  label={t('config_management.visual.sections.headers.os')}
                  placeholder="MacOS"
                  value={values.claudeHeaderOs}
                  onChange={(e) => onChange({ claudeHeaderOs: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderArch">
                <Input
                  label={t('config_management.visual.sections.headers.arch')}
                  placeholder="arm64"
                  value={values.claudeHeaderArch}
                  onChange={(e) => onChange({ claudeHeaderArch: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="claudeHeaderTimeout">
                <Input
                  label={t('config_management.visual.sections.headers.timeout')}
                  placeholder="600"
                  value={values.claudeHeaderTimeout}
                  onChange={(e) => onChange({ claudeHeaderTimeout: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
            </FieldGrid>
            <FieldGrid>
              <FieldAnchor fieldId="claudeHeaderStabilizeDeviceProfile">
                <ToggleRow
                  title={t('config_management.visual.sections.headers.stabilize_device')}
                  description={t('config_management.visual.sections.headers.stabilize_device_desc')}
                  checked={values.claudeHeaderStabilizeDeviceProfile}
                  disabled={disabled}
                  onChange={(claudeHeaderStabilizeDeviceProfile) =>
                    onChange({ claudeHeaderStabilizeDeviceProfile })
                  }
                />
              </FieldAnchor>
            </FieldGrid>
            <Divider />
            <FieldGroupHeading title={t('config_management.visual.sections.headers.codex_title')} />
            <FieldGrid>
              <FieldAnchor fieldId="codexHeaderUserAgent">
                <Input
                  label={t('config_management.visual.sections.headers.user_agent')}
                  placeholder="codex_cli_rs/0.114.0 (Mac OS 14.2.0; x86_64) vscode/1.111.0"
                  value={values.codexHeaderUserAgent}
                  onChange={(e) => onChange({ codexHeaderUserAgent: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
              <FieldAnchor fieldId="codexHeaderBetaFeatures">
                <Input
                  label={t('config_management.visual.sections.headers.beta_features')}
                  placeholder="multi_agent"
                  value={values.codexHeaderBetaFeatures}
                  onChange={(e) => onChange({ codexHeaderBetaFeatures: e.target.value })}
                  disabled={disabled}
                />
              </FieldAnchor>
            </FieldGrid>
          </FieldStack>
        </Collapsible>
      </FieldStack>
    </SectionCard>
  );
}
