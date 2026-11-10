import type { Readable } from '../core/state';
import { createState } from '../core/state';
import type { SettingsStore } from '../config/settings';
import { diagnostics } from '../core/diagnostics';

const appearance = createState({ theme: 'light' as 'light' | 'dark', accentColor: '#ff5d23' });

export function actionColor(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const luminance = (scale: number) => channels.reduce((sum, channel, index) => {
    const value = Math.round(channel * scale) / 255;
    return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!;
  }, 0);
  let scale = 1;
  while ((1.05 / (luminance(scale) + 0.05)) < 4.5) scale -= 0.01;
  return `#${channels.map(channel => Math.round(channel * scale).toString(16).padStart(2, '0')).join('')}`;
}

export function connectTheme(settings: SettingsStore, pageTheme: Readable<'light' | 'dark'>) {
  const root = document.documentElement;
  const previous = root.style.getPropertyValue('--guanyu-page-accent');
  let detected: 'light' | 'dark' = 'light';
  const refresh = () => {
    const value = settings.runtime.value;
    appearance.set({ theme: value.theme === 'page' ? detected : value.theme, accentColor: value.accentColor });
    root.style.setProperty('--guanyu-page-accent', value.accentColor);
    diagnostics.report('theme', 'applied', value.theme === 'page' ? `已应用跟随页面的${detected === 'dark' ? '深色' : '浅色'}主题与主题色` : `已应用固定${value.theme === 'dark' ? '深色' : '浅色'}主题与主题色`);
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
    node.style.setProperty('--guanyu-action', actionColor(value.accentColor));
  });
  return { destroy: stop };
}
