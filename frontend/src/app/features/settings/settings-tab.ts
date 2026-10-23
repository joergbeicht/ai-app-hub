export const SETTINGS_TABS = ['general', 'apps', 'users', 'groups', 'roles'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general';

export function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab === value);
}

/**
 * Tabs werden je nach Recht ein- oder ausgeblendet; der Index der `mat-tab-group` bezieht sich
 * deshalb immer auf die sichtbaren Tabs. Unsichtbare oder unbekannte Tabs fallen auf den ersten zurück.
 */
export function settingsTabToIndex(tab: SettingsTab, visibleTabs: readonly SettingsTab[]): number {
  return Math.max(visibleTabs.indexOf(tab), 0);
}

export function settingsIndexToTab(index: number, visibleTabs: readonly SettingsTab[]): SettingsTab {
  return visibleTabs[index] ?? DEFAULT_SETTINGS_TAB;
}
