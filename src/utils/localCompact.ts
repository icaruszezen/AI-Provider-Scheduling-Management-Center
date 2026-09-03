/**
 * Codex 凭据的「本地 compact」覆盖是三态的：不写字段表示跟随全局开关，
 * 写 true/false 表示该凭据强制开启或关闭。表单用字符串承载这三态，
 * 写盘时再转回 `boolean | undefined`。
 */

export type LocalCompactMode = 'inherit' | 'enabled' | 'disabled';

export const LOCAL_COMPACT_MODES: readonly LocalCompactMode[] = [
  'inherit',
  'enabled',
  'disabled',
] as const;

/** 把凭据配置里的三态值映射成表单选项。 */
export const localCompactModeFromConfig = (value?: boolean): LocalCompactMode => {
  if (value === undefined) return 'inherit';
  return value ? 'enabled' : 'disabled';
};

/** 把表单选项映射回凭据配置值；`undefined` 表示清除覆盖、跟随全局。 */
export const localCompactModeToConfig = (mode?: LocalCompactMode): boolean | undefined => {
  if (mode === 'enabled') return true;
  if (mode === 'disabled') return false;
  return undefined;
};
