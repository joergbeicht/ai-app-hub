import { isSettingsTab, settingsIndexToTab, settingsTabToIndex, type SettingsTab } from './settings-tab';

describe('settings tabs', () => {
  const visible: SettingsTab[] = ['general', 'apps', 'groups'];

  it('maps tabs to the index among the visible tabs', () => {
    expect(settingsTabToIndex('groups', visible)).toBe(2);
    expect(settingsIndexToTab(2, visible)).toBe('groups');
  });

  it('falls back to the first tab for hidden tabs or out-of-range indexes', () => {
    expect(settingsTabToIndex('roles', visible)).toBe(0);
    expect(settingsIndexToTab(7, visible)).toBe('general');
  });

  it('recognizes known tab names only', () => {
    expect(isSettingsTab('roles')).toBeTrue();
    expect(isSettingsTab('audit')).toBeFalse();
    expect(isSettingsTab(null)).toBeFalse();
  });
});
