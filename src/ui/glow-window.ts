import { mount, unmount, flushSync } from 'svelte';
import GlowPrompt from './GlowPrompt.svelte';
import type { BackpackController } from '../features/backpack/controller';
import type { SettingsStore } from '../config/settings';
import styles from './settings.css?style';
import glowStyles from './glow-prompt.css?style';
import motion from './motion.css?style';
import scrollbars from './scrollbars.css?style';
import { isolateKeyboard } from './modal';

export function createGlowWindow(backpack: BackpackController, settings: SettingsStore) {
  const host = document.createElement('div'); host.id = 'guanyu-glow-window';
  const root = host.attachShadow({ mode: 'open' }); root.append(styles.cloneNode(true), glowStyles.cloneNode(true), motion.cloneNode(true), scrollbars.cloneNode(true));
  const stopKeyboard = isolateKeyboard(root);
  const component = mount(GlowPrompt, { target: root, props: { backpack, settings } }); flushSync();
  return {
    open() { (document.fullscreenElement || document.body).append(host); component.show(); },
    dispose() { stopKeyboard(); void unmount(component); host.remove(); },
  };
}
