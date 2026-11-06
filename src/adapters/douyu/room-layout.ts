import type { SettingsStore } from '../../config/settings';
import type { TeamController } from '../../features/team-live/controller';
import { isPlayerFullscreen } from './player';

const protectedContent = '#js-player-main, #js-player-asideMain, #js-room-snapbar, .room-info, .wm-pc-room-button';

export function readRoomLayout() {
  const player = document.getElementById('js-player-main');
  const root = player?.closest<HTMLElement>('#root, .layout-Main');
  if (!player || !root) return null;
  let section = player;
  while (section.parentElement && section.parentElement !== root) section = section.parentElement;
  if (section.parentElement !== root) return null;
  return { player, root, section };
}

export function mountRoomLayout(settings: SettingsStore, team: TeamController) {
  const hidden = new Set<HTMLElement>();
  let spacing: { root: HTMLElement; top: number; bottom: number; extra: number;
    styles: Map<string, { value: string; priority: string; applied: string }> } | undefined;
  let frame = 0;
  function restoreProperty(property: string) {
    const saved = spacing?.styles.get(property);
    if (!spacing || !saved) return;
    if (spacing.root.style.getPropertyValue(property) === saved.applied) {
      if (saved.value) spacing.root.style.setProperty(property, saved.value, saved.priority); else spacing.root.style.removeProperty(property);
    }
    spacing.styles.delete(property);
  }
  function setProperty(property: string, value: string) {
    if (!spacing) return;
    let saved = spacing.styles.get(property);
    if (!saved) {
      saved = { value: spacing.root.style.getPropertyValue(property), priority: spacing.root.style.getPropertyPriority(property), applied: '' };
      spacing.styles.set(property, saved);
    }
    saved.applied = value;
    if (spacing.root.style.getPropertyValue(property) !== value) spacing.root.style.setProperty(property, value, saved.priority);
  }
  function restoreSpacing() {
    if (!spacing) return;
    for (const property of [...spacing.styles.keys()]) restoreProperty(property);
    spacing = undefined;
  }
  function contentColor(target: HTMLElement, root: HTMLElement) {
    for (let node: HTMLElement | null = target; node && node !== root; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      const channels = color.match(/[\d.]+/g)?.map(Number);
      if (channels && (channels.length === 3 || channels.length === 4 && channels[3] === 1)) return color;
    }
    return '';
  }
  function restoreExtras(keep = new Set<HTMLElement>()) {
    for (const node of hidden) if (!keep.has(node)) { node.classList.remove('guanyu-room-extra-hidden'); hidden.delete(node); }
  }
  function sync() {
    frame = 0;
    const layout = readRoomLayout();
    if (!layout) { restoreSpacing(); restoreExtras(); return; }
    const { player, root, section } = layout;
    const options = settings.runtime.value.optimization;
    const extras = new Set<HTMLElement>();
    if (options.hideRoomExtras) {
      let node = section.nextElementSibling;
      while (node) {
        if (node instanceof HTMLElement && node.matches('.bc-wrapper, .wm-general, .ActivityPlatformContent')
          && !node.matches(protectedContent) && !node.querySelector(protectedContent)) {
          const rect = node.getBoundingClientRect();
          const decoration = node.matches('.wm-general') && !!node.querySelector(':scope > .wm-general-wrapper')
            && !node.textContent?.trim() && !node.querySelector('a, button, input, video, iframe, [role="button"]');
          const known = node.matches('.ActivityPlatformContent') || decoration || !!node.querySelector('.webm-footer-v2')
            || !!node.querySelector(':scope > .wm-view') && (hidden.has(node) || rect.width >= 600 && rect.height >= 160);
          if (known) extras.add(node);
        }
        node = node.nextElementSibling;
      }
    }
    restoreExtras(extras);
    for (const node of extras) {
      if (!node.classList.contains('guanyu-room-extra-hidden')) node.classList.add('guanyu-room-extra-hidden');
      hidden.add(node);
    }
    if (spacing && spacing.root !== root) restoreSpacing();
    if (!options.hideTopBanner && !options.hideRoomExtras) { restoreSpacing(); return; }
    if (!spacing) {
      const computed = getComputedStyle(root);
      spacing = { root, top: parseFloat(computed.paddingTop) || 0, bottom: parseFloat(computed.paddingBottom) || 0, extra: 0, styles: new Map() };
    }
    if (options.hideRoomExtras) setProperty('padding-bottom', `${spacing.bottom + 24}px`); else restoreProperty('padding-bottom');
    const target = team.value.source?.native.parentElement;
    const first = target && root.contains(target) && target.getBoundingClientRect().height > 0
      && target.getBoundingClientRect().top < player.getBoundingClientRect().top ? target : player;
    const color = contentColor(first, root);
    if (color) setProperty('background-color', color); else restoreProperty('background-color');
    if (!options.hideTopBanner) { restoreProperty('padding-top'); spacing.extra = 0; return; }
    if (isPlayerFullscreen()) return;
    const header = document.querySelector<HTMLElement>('.Header-wrap') ?? document.querySelector<HTMLElement>('.layout-Header');
    const headerHeight = header?.getBoundingClientRect().height || 0;
    if (!headerHeight) { restoreProperty('padding-top'); spacing.extra = 0; return; }
    const top = first.getBoundingClientRect().top + scrollY;
    const gap = first === target ? 32 : 8;
    // 按文档坐标补足导航高度和间距，滚动或导航隐藏不改变原有占位。
    const extra = Math.max(0, Math.ceil(headerHeight + gap - (top - spacing.extra)));
    if (extra !== spacing.extra) {
      spacing.extra = extra;
      if (extra) setProperty('padding-top', `${spacing.top + extra}px`); else restoreProperty('padding-top');
      window.dispatchEvent(new Event('resize'));
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(sync); }
  const stopSettings = settings.runtime.subscribe(schedule), stopTeam = team.subscribe(schedule);
  const timer = setInterval(schedule, 750);
  window.addEventListener('resize', schedule);
  document.addEventListener('fullscreenchange', schedule);
  return () => {
    stopSettings(); stopTeam(); clearInterval(timer); cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule); document.removeEventListener('fullscreenchange', schedule);
    restoreSpacing(); restoreExtras(); window.dispatchEvent(new Event('resize'));
  };
}
