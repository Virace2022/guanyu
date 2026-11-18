import { mount, unmount } from 'svelte';
import { attachQuickDock } from '../adapters/douyu/quick-dock';
import QuickDock from './QuickDock.svelte';
import type { SettingsStore } from '../config/settings';
import styles from './quick-dock.css?style';

export function mountQuickDock(settings: SettingsStore, openSettings: () => void, startup: Promise<boolean>) {
  const host = document.createElement('div'); host.id = 'guanyu-quick-dock';
  const root = host.attachShadow({ mode: 'open' }); root.append(styles.cloneNode(true));
  const component = mount(QuickDock, { target: root, props: { settings, openSettings, startup } });
  const detach = attachQuickDock(host);
  return () => { detach(); void unmount(component); };
}
