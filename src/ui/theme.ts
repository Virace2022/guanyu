import type { Readable } from '../core/state';
import { createState } from '../core/state';
import type { SettingsStore } from '../config/settings';

const appearance = createState({ theme: 'light' as 'light' | 'dark', accentColor: '#ff5d23' });

export function accentText(color: string) {
  const channels = [1, 3, 5].map(index => {
    const value = parseInt(color.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722 > 0.179 ? '#000' : '#fff';
}

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
    node.style.setProperty('--guanyu-on-accent', accentText(value.accentColor));
  });
  return { destroy: stop };
}
