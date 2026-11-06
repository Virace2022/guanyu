import type { Readable } from '../core/state';
import { createState } from '../core/state';
import type { SettingsStore } from '../config/settings';

const appearance = createState({ theme: 'light' as 'light' | 'dark', accentColor: '#ff5d23' });

export function connectTheme(settings: SettingsStore, pageTheme: Readable<'light' | 'dark'>) {
  const root = document.documentElement;
  const previous = root.style.getPropertyValue('--guanyu-page-accent');
  let detected: 'light' | 'dark' = 'light';
  const refresh = () => {
    const value = settings.runtime.value;
    appearance.set({ theme: value.theme === 'page' ? detected : value.theme, accentColor: value.accentColor });
    root.style.setProperty('--guanyu-page-accent', value.accentColor);
  };
  const stopPage = pageTheme.subscribe(value => { detected = value; refresh(); });
  const stopSettings = settings.runtime.subscribe(refresh);
  return () => {
    stopPage(); stopSettings();
    if (previous) root.style.setProperty('--guanyu-page-accent', previous); else root.style.removeProperty('--guanyu-page-accent');
  };
}

export function bindTheme(node: HTMLElement) {
  const stop = appearance.subscribe(value => {
    node.dataset.theme = value.theme;
    node.style.setProperty('--guanyu-accent', value.accentColor);
  });
  return { destroy: stop };
}
