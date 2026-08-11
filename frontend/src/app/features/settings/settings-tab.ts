export const SETTINGS_TABS = ['general', 'apps', 'users'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general';

export function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab === value);
}

export function settingsTabToIndex(tab: SettingsTab): number {
  return SETTINGS_TABS.indexOf(tab);
}

export function settingsIndexToTab(index: number): SettingsTab {
  return SETTINGS_TABS[index] ?? DEFAULT_SETTINGS_TAB;
}
