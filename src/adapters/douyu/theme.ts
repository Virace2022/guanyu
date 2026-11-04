import { createState } from '../../core/state';

export function observePageTheme() {
  const state = createState<'light' | 'dark'>('light');
  const media = matchMedia('(prefers-color-scheme: dark)');
  function refresh() {
    for (const element of [document.body, document.documentElement]) {
      const color = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (!color || color.length < 3 || color[3] === 0) continue;
      state.set(color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722 < 128 ? 'dark' : 'light');
      return;
    }
    state.set(media.matches ? 'dark' : 'light');
  }
  const observer = new MutationObserver(refresh);
  for (const element of [document.body, document.documentElement]) {
    observer.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  }
  media.addEventListener('change', refresh);
  refresh();
  return { ...state, dispose() { observer.disconnect(); media.removeEventListener('change', refresh); } };
}
