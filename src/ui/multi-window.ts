import { mount, flushSync, unmount } from 'svelte';
import MultiPrompt from './MultiPrompt.svelte';
import type { MultiscreenController } from '../features/multiscreen/feature';
import styles from './settings.css?style';
import motion from './motion.css?style';
import scrollbars from './scrollbars.css?style';
import { isolateKeyboard } from './modal';
export function createMultiWindow(multi: MultiscreenController) {
  let host: HTMLDivElement | undefined;
  let component: ReturnType<typeof mount> & { show(target?: number): void } | undefined;
  let stopKeyboard: (() => void) | undefined;
  return {
    open(target?: number) {
      if (!host || !component) {
        host = document.createElement('div'); host.id = 'guanyu-multi-window';
        const root = host.attachShadow({ mode: 'open' });
        root.append(styles.cloneNode(true), motion.cloneNode(true), scrollbars.cloneNode(true));
        document.body.append(host);
        stopKeyboard = isolateKeyboard(root);
        component = mount(MultiPrompt, { target: root, props: { multi } });
        flushSync();
      } else if (!host.isConnected) document.body.append(host);
      component.show(target);
    },
    dispose() { stopKeyboard?.(); if (component) void unmount(component); host?.remove(); },
  };
}
