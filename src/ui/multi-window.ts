import { mount, flushSync, unmount } from 'svelte';
import MultiPrompt from './MultiPrompt.svelte';
import type { MultiscreenController } from '../features/multiscreen/feature';
import styles from './settings.css?style';
import motion from './motion.css?style';
import scrollbars from './scrollbars.css?style';
export function createMultiWindow(multi: MultiscreenController) {
  const host = document.createElement('div'); host.id = 'guanyu-multi-window';
  const root = host.attachShadow({ mode: 'open' }); root.append(styles.cloneNode(true), motion.cloneNode(true), scrollbars.cloneNode(true)); document.body.append(host);
  const component = mount(MultiPrompt, { target: root, props: { multi } }); flushSync();
  return { open: (target?: number) => { if (!host.isConnected) document.body.append(host); component.show(target); }, dispose() { void unmount(component); host.remove(); } };
}
