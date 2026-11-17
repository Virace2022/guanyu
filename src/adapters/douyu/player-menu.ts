import type { SettingsStore } from '../../config/settings';
import type { MenuAction } from '../../config/player-menu';
import { mountPlayerSubmenu, type PlayerSubmenu } from './player-submenu';
import styles from '../../ui/player-menu.css?style';
import { diagnostics } from '../../core/diagnostics';
import type { ScreenController } from '../../features/multiscreen/screens';

export interface PlayerAction { label: () => string; run?: () => void | Promise<unknown>; enabled?: () => boolean; visible?: () => boolean; checked?: () => boolean; submenu?: PlayerSubmenu }
export interface PlayerMenuContext { screens: ScreenController; actions: Record<string, PlayerAction> }
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
export function mountPlayerMenu(settings: SettingsStore, configured: Partial<Record<MenuAction, PlayerAction>>, report: (message: string) => void, context?: PlayerMenuContext) {
  const actions: Record<string, PlayerAction> = { ...configured, ...context?.actions };
  const nodes = new Map<string, HTMLElement>();
  const labels = new Map<string, HTMLElement>(), release = new Map<string, () => void>();
  const title = document.createElement('li'); title.dataset.guanyuAction = 'screenTarget'; title.className = 'guanyu-context-title';
  const sheet = styles.cloneNode(true);
  document.head.append(sheet);
  for (const [id, action] of Object.entries(actions)) {
    const item = document.createElement('li'); item.dataset.guanyuAction = id; item.tabIndex = 0; item.setAttribute('role', 'menuitem');
    const label = document.createElement('span'); labels.set(id, label);
    if (action.submenu) { const name = document.createElement('div'); name.className = 'name-2f52df'; name.append(label); item.append(name); }
    else item.append(label);
    const run = () => { if (action.enabled?.() === false) return; Promise.resolve().then(action.run).then(() => { diagnostics.report('menu', 'applied', `${action.label()} 操作已完成`, '操作'); sync(); }).catch(error => { diagnostics.report('menu', 'error', `${action.label()}：${String(error instanceof Error ? error.message : error)}`, '操作'); report(String(error instanceof Error ? error.message : error)); }); };
    if (action.submenu) release.set(id, mountPlayerSubmenu(item, action.submenu, report));
    else {
      item.onclick = run;
      item.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); run(); } };
    }
    nodes.set(id, item);
  }
  function sync() {
    const menu = document.querySelector('.menu-da2a9e:not(.subMenu-de1c61)');
    const contextual = context?.screens.isMulti() && settings.value.multi.enabled ? ['screenRefresh', 'screenQuality', 'screenChange', 'screenLine'] : [];
    const active = [...contextual, ...settings.value.playerMenu].filter(id => actions[id]?.visible?.() !== false);
    for (const [id, item] of nodes) {
      if (!active.includes(id) || !menu) { item.remove(); continue; }
      const action = actions[id];
      if (action) {
        const label = action.label(), checked = action.checked?.();
        labels.get(id)!.textContent = `${checked ? '✓ ' : ''}${label}`; item.setAttribute('aria-label', label);
        item.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemcheckbox');
        if (checked === undefined) item.removeAttribute('aria-checked'); else item.setAttribute('aria-checked', String(checked));
        item.setAttribute('aria-disabled', String(action.enabled?.() === false));
      }
    }
    if (!menu) { diagnostics.report('menu', 'idle', '等待打开播放器右键菜单；宿主：.menu-da2a9e:not(.subMenu-de1c61)'); return; }
    if (context) {
      const screen = context.screens.current(), multi = context.screens.isMulti();
      menu.setAttribute('data-guanyu-screen-id', String(screen?.id ?? ''));
      title.textContent = `${context.screens.name()}${screen?.main ? ' · 主直播间' : ''}`;
      if (!multi) title.remove();
    }
    const native = [...menu.children].filter(node => !node.hasAttribute('data-guanyu-action'));
    const header = native[0]?.classList.contains('disable-23f484') && /^Douyu_/.test(native[0].textContent?.trim() ?? '') ? native[0] : undefined;
    const anchor = header ? native[1] : native[0];
    let next: Element | null = anchor ?? null;
    for (const id of [...active].reverse()) {
      const item = nodes.get(id); if (!item) continue;
      if (item.parentElement !== menu || item.nextElementSibling !== next) menu.insertBefore(item, next);
      next = item;
    }
    if (context?.screens.isMulti()) menu.insertBefore(title, next ?? anchor ?? null);
    diagnostics.report('menu', 'applied', `已挂载菜单项：${active.map(id => actions[id]?.label() ?? id).join('、')}`);
  }
  let frame = 0;
  const onContext = (event: MouseEvent) => {
    if (context?.screens.capture(event)) sync();
    cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { sync(); frame = requestAnimationFrame(sync); });
  };
  const keyup = (event: KeyboardEvent) => { if ((event.target as Element)?.closest?.('.menu-da2a9e [data-guanyu-action]')) event.stopImmediatePropagation(); };
  const keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement, item = target.closest?.<HTMLElement>('[data-guanyu-action]');
    if (!item?.closest('.menu-da2a9e')) return;
    const submenu = target.closest<HTMLElement>('.guanyu-submenu');
    if (event.key === 'Escape' || event.key === 'ArrowLeft' && submenu) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (submenu) { submenu.style.visibility = 'hidden'; item.setAttribute('aria-expanded', 'false'); item.focus({ preventScroll: true }); }
      else context?.screens.closeMenu();
    } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const list = submenu ?? item.parentElement!;
      const rows = [...list.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]')].filter(row => row.getAttribute('aria-disabled') !== 'true');
      if (!rows.length) return;
      const index = rows.indexOf(target.closest<HTMLElement>('[role^="menuitem"]')!);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length;
      rows[next]?.focus({ preventScroll: true }); rows[next]?.scrollIntoView({ block: 'nearest' });
    }
  };
  window.addEventListener('contextmenu', onContext, true); window.addEventListener('keyup', keyup, true); window.addEventListener('keydown', keydown, true);
  const timer = setInterval(sync, 1000), stop = settings.subscribe(sync);
  return {
    dispose() { stop(); clearInterval(timer); cancelAnimationFrame(frame); window.removeEventListener('contextmenu', onContext, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('keydown', keydown, true); for (const dispose of release.values()) dispose(); for (const item of nodes.values()) item.remove(); document.querySelector('.menu-da2a9e[data-guanyu-screen-id]')?.removeAttribute('data-guanyu-screen-id'); title.remove(); sheet.parentNode?.removeChild(sheet); },
  };
}
