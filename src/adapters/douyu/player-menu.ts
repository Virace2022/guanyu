import type { SettingsStore } from '../../config/settings';
import type { MenuAction } from '../../config/player-menu';
import { mountPlayerSubmenu, type PlayerSubmenu } from './player-submenu';
import styles from '../../ui/player-menu.css?style';

export interface PlayerAction { label: () => string; run?: () => void | Promise<unknown>; enabled?: () => boolean; checked?: () => boolean; submenu?: PlayerSubmenu }
export interface NativeMenuEntry { label: string; separator: boolean; disabled: boolean; submenu: boolean }
export function readNativeMenu(): { items: NativeMenuEntry[]; style: string } {
  const menu = document.querySelector('.menu-da2a9e:not(.subMenu-de1c61)');
  const appearance = menu ? getComputedStyle(menu) : null;
  const items = [...(menu?.children ?? [])].filter(node => !node.hasAttribute('data-guanyu-action')).map(node => ({
    label: (node.querySelector(':scope > .name-2f52df') ?? node).textContent?.trim() ?? '',
    separator: node.classList.contains('divider-f9d33d'), disabled: node.classList.contains('disable-23f484'),
    submenu: node.classList.contains('subItem-11a1fb'),
  }));
  return { items, style: appearance ? `--guanyu-native-menu-color:${appearance.color};--guanyu-native-menu-font:${appearance.fontFamily};--guanyu-native-menu-background:${appearance.backgroundColor};--guanyu-native-menu-border:${appearance.borderColor}` : '' };
}
export function mountPlayerMenu(settings: SettingsStore, actions: Partial<Record<MenuAction, PlayerAction>>, report: (message: string) => void) {
  const nodes = new Map<MenuAction, HTMLElement>(), external = new Set<MenuAction>();
  const labels = new Map<MenuAction, HTMLElement>(), release = new Map<MenuAction, () => void>();
  const sheet = styles.cloneNode(true);
  document.head.append(sheet);
  for (const [id, action] of Object.entries(actions) as [MenuAction, PlayerAction][]) {
    const item = document.createElement('li'); item.dataset.guanyuAction = id; item.tabIndex = 0; item.setAttribute('role', 'menuitem');
    const label = document.createElement('span'); labels.set(id, label);
    if (action.submenu) { const name = document.createElement('div'); name.className = 'name-2f52df'; name.append(label); item.append(name); }
    else item.append(label);
    const run = () => { if (action.enabled?.() === false) return; Promise.resolve().then(action.run).then(sync).catch(error => report(String(error instanceof Error ? error.message : error))); };
    if (action.submenu) release.set(id, mountPlayerSubmenu(item, action.submenu, report));
    else {
      item.onclick = run;
      item.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); run(); } };
    }
    nodes.set(id, item);
  }
  function sync() {
    const menu = document.querySelector('.menu-da2a9e:not(.subMenu-de1c61)');
    const active = settings.value.playerMenu;
    for (const [id, item] of nodes) {
      if (!active.includes(id) || !menu) { item.remove(); continue; }
      const action = actions[id];
      if (!external.has(id) && action) {
        const label = action.label(), checked = action.checked?.();
        labels.get(id)!.textContent = `${checked ? '✓ ' : ''}${label}`; item.setAttribute('aria-label', label);
        item.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemcheckbox');
        if (checked === undefined) item.removeAttribute('aria-checked'); else item.setAttribute('aria-checked', String(checked));
        item.setAttribute('aria-disabled', String(action.enabled?.() === false));
      }
    }
    if (!menu) return;
    const anchor = [...menu.children].find((node, index) => index > 0 && !(node instanceof HTMLElement && node.dataset.guanyuAction));
    let next: Element | null = anchor ?? null;
    for (const id of [...active].reverse()) {
      const item = nodes.get(id); if (!item) continue;
      if (item.parentElement !== menu || item.nextElementSibling !== next) menu.insertBefore(item, next);
      next = item;
    }
  }
  let frame = 0;
  const onContext = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { sync(); frame = requestAnimationFrame(sync); }); };
  document.addEventListener('contextmenu', onContext, true);
  const timer = setInterval(sync, 1000), stop = settings.subscribe(sync);
  return {
    register(id: MenuAction, item: HTMLElement) { release.get(id)?.(); release.delete(id); nodes.get(id)?.remove(); item.dataset.guanyuAction = id; item.tabIndex = 0; item.setAttribute('role', 'menuitem'); nodes.set(id, item); external.add(id); sync(); },
    dispose() { stop(); clearInterval(timer); cancelAnimationFrame(frame); document.removeEventListener('contextmenu', onContext, true); for (const dispose of release.values()) dispose(); for (const item of nodes.values()) item.remove(); sheet.parentNode?.removeChild(sheet); },
  };
}
