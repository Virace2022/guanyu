import type { MultiscreenController } from '../features/multiscreen/feature';
import type { PlayerMenuContext } from '../adapters/douyu/player-menu';
import type { PlayerSubmenu } from '../adapters/douyu/player-submenu';

export function createScreenMenu(multi: MultiscreenController) {
  const screens = multi.screens;
  function choices(kind: 'quality' | 'line'): PlayerSubmenu {
    const element = document.createElement('ul');
    let signature = '';
    function prepare() {
      const target = screens.current();
      const value = target && multi.quality.get(target.id);
      const key = JSON.stringify([target?.id, value]); if (key === signature) return;
      const focused = [...element.children].indexOf(document.activeElement as Element);
      signature = key; element.replaceChildren();
      if (!target || !value) return;
      const items = kind === 'quality' ? value.rates.map(item => ({ id: String(item.rate), name: item.name, checked: value.ready && item.rate === value.rate }))
        : (value.lines ?? []).map(item => ({ id: item.cdn, name: item.name, checked: value.ready && item.cdn === value.line }));
      for (const item of items) {
        const row = document.createElement('li'); row.tabIndex = 0; row.setAttribute('role', 'menuitemradio');
        row.setAttribute('aria-checked', String(item.checked)); row.setAttribute('aria-disabled', String(value.pending));
        row.classList.toggle('disable-23f484', value.pending);
        row.textContent = `${item.checked ? '✓ ' : ''}${item.name}`;
        const run = () => {
          if (value.pending || screens.current()?.id !== target.id) return;
          void (kind === 'quality' ? multi.quality.change(target.id, Number(item.id)) : multi.quality.changeLine(target.id, item.id)).then(prepare);
        };
        row.onclick = event => { event.stopPropagation(); run(); };
        row.onkeydown = event => {
          if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); run(); }
          if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation();
            const rows = [...element.querySelectorAll<HTMLElement>('li[role="menuitemradio"]')], index = rows.indexOf(row);
            rows[(index + (event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length]?.focus();
          }
        };
        element.append(row);
      }
      if (!items.length) {
        const row = document.createElement('li'); row.tabIndex = 0; row.setAttribute('role', 'menuitem'); row.textContent = value.loading ? '读取中…' : '重新读取可选项';
        row.onclick = () => { if (!value.loading) void multi.quality.read(target.id).then(prepare); }; element.append(row);
      }
      if (value.error) { const row = document.createElement('li'); row.className = 'guanyu-menu-error'; row.textContent = value.error; element.append(row); }
      if (focused >= 0) (element.children[Math.min(focused, element.children.length - 1)] as HTMLElement | undefined)?.focus({ preventScroll: true });
    }
    return { element, prepare };
  }
  const rates = choices('quality'), lines = choices('line');
  const context: PlayerMenuContext = { screens, actions: {
    screenRefresh: { label: () => { const target = screens.current(); return target && multi.quality.get(target.id).refreshing ? '刷新中…' : '刷新此画面'; },
      enabled: () => { const target = screens.current(); return !!target && !multi.quality.get(target.id).pending; },
      run: async () => { const target = screens.current(); if (!target) return; await multi.quality.refresh(target.id); const error = multi.quality.get(target.id).error; if (error) throw new Error(error); } },
    screenQuality: { label: () => '清晰度', submenu: rates, enabled: () => !!screens.current() },
    screenChange: { label: () => '更换直播间…', visible: () => !screens.current()?.main, enabled: () => !!screens.current(), run: () => { const target = screens.current(); if (target && !target.main) multi.replace(target.id); } },
    screenLine: { label: () => '线路', submenu: lines, enabled: () => !!screens.current() },
  } };
  const stop = multi.quality.subscribe(() => { for (const menu of [rates, lines]) if (menu.element.parentElement?.matches(':hover, :focus-within')) menu.prepare?.(); });
  return { context, dispose() { stop(); rates.element.remove(); lines.element.remove(); } };
}
