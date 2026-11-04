import { mount, unmount } from 'svelte';
import { attachQuickDock } from '../adapters/douyu/quick-dock';
import QuickDock from './QuickDock.svelte';
import type { SettingsStore } from '../config/settings';
import type { TeamController } from '../features/team-live/controller';
import type { Readable } from '../core/state';
import styles from './quick-dock.css?style';
import motionStyles from './motion.css?style';
import scrollbarStyles from './scrollbars.css?style';

export function mountQuickDock(settings: SettingsStore, team: TeamController,
  pageTheme: Readable<'light' | 'dark'>, openSettings: () => void, openTeam: () => void) {
  const host = document.createElement('div'); host.id = 'guanyu-quick-dock';
  const root = host.attachShadow({ mode: 'open' }); root.append(styles.cloneNode(true), motionStyles.cloneNode(true), scrollbarStyles.cloneNode(true));
  const component = mount(QuickDock, { target: root, props: { settings, team, pageTheme, openSettings, openTeam } });
  const detach = attachQuickDock(host, () => component.dismiss());
  return () => { detach(); void unmount(component); };
}
