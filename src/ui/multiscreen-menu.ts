import type { MultiQuality } from '../features/multiscreen/quality';
import styles from './multiscreen-menu.css?style';

export interface LabelMenuTarget {
  id: number;
  name: string;
  main: boolean;
  anchor: HTMLElement;
  slot: HTMLElement;
  lock: (open: boolean) => void;
}

export function createMultiscreenMenu(quality: MultiQuality, replace: (id: number) => void) {
  const sheet = styles.cloneNode(true); document.head.append(sheet);
  const node = document.createElement('div'); node.className = 'guanyu-label-menu'; node.hidden = true; node.setAttribute('role', 'menu');
  const heading = document.createElement('div'); heading.className = 'guanyu-label-menu-title';
  const rates = document.createElement('button'); rates.type = 'button'; rates.className = 'guanyu-label-menu-item'; rates.setAttribute('role', 'menuitem'); rates.setAttribute('aria-haspopup', 'menu');
  const submenu = document.createElement('div'); submenu.className = 'guanyu-label-menu-rates'; submenu.setAttribute('role', 'menu'); submenu.hidden = true;
  const change = document.createElement('button'); change.type = 'button'; change.className = 'guanyu-label-menu-item'; change.textContent = '更换直播间…'; change.setAttribute('role', 'menuitem');
  const status = document.createElement('div'); status.className = 'guanyu-label-menu-status'; status.setAttribute('role', 'status');
  node.append(heading, rates, change, status, submenu);
  let target: LabelMenuTarget | null = null, signature = '';
  function valid() { return !!target?.anchor.isConnected && target.slot.isConnected && Number(target.anchor.dataset.guanyuAudioRoom) === target.id; }
  function close(focus = false) {
    const previous = target; target = null; node.hidden = true; submenu.hidden = true; signature = '';
    rates.setAttribute('aria-expanded', 'false');
    previous?.lock(false);
    if (focus && previous?.anchor.isConnected) previous.anchor.querySelector<HTMLElement>('.guanyu-audio-switch')?.focus({ preventScroll: true });
  }
  function position() {
    const bounds = node.parentElement?.getBoundingClientRect(); if (!bounds) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(0, Math.min(parseFloat(node.style.left) || 0, bounds.width - rect.width))}px`;
    node.style.top = `${Math.max(0, Math.min(parseFloat(node.style.top) || 0, bounds.height - rect.height))}px`;
    submenu.style.left = `${node.offsetWidth - 2}px`; submenu.style.top = `${rates.offsetTop}px`;
    if (!submenu.hidden) {
      const sub = submenu.getBoundingClientRect(), parent = node.getBoundingClientRect();
      if (sub.right > bounds.right) submenu.style.left = `${2 - submenu.offsetWidth}px`;
      submenu.style.top = `${Math.max(bounds.top - parent.top, Math.min(rates.offsetTop, bounds.bottom - parent.top - sub.height))}px`;
    }
  }
  function render() {
    if (!target) return;
    if (!valid()) { close(); return; }
    const value = quality.get(target.id), current = value.rates.find(rate => rate.rate === value.rate)?.name;
    const detail = value.pending ? '切换中…' : current ?? (value.loading ? '读取中…' : '');
    rates.textContent = `清晰度${detail ? `　${detail}` : ''}　›`;
    rates.setAttribute('aria-expanded', String(!submenu.hidden));
    status.textContent = value.error; status.hidden = !value.error;
    const next = JSON.stringify(value);
    if (next !== signature) {
      signature = next; submenu.replaceChildren();
      for (const item of value.rates) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'guanyu-label-menu-item';
        button.textContent = `${value.ready && value.rate === item.rate ? '✓ ' : ''}${item.name}`;
        button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(value.ready && value.rate === item.rate));
        button.disabled = value.pending;
        button.onclick = () => { if (valid() && target) void quality.change(target.id, item.rate).then(render); };
        submenu.append(button);
      }
      if (!value.rates.length) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'guanyu-label-menu-item'; button.setAttribute('role', 'menuitem');
        button.textContent = value.loading ? '正在读取清晰度…' : '重新获取清晰度'; button.disabled = value.loading;
        button.onclick = () => { if (valid() && target) void quality.read(target.id); }; submenu.append(button);
      }
    }
    position();
  }
  function expand(focus = false) {
    submenu.hidden = false; rates.setAttribute('aria-expanded', 'true'); render();
    if (focus) submenu.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }
  rates.onmouseenter = () => expand(); rates.onclick = () => expand(true);
  change.onclick = () => { if (!valid() || !target || target.main) return; const id = target.id; close(); replace(id); };
  function keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); if (!submenu.hidden) { submenu.hidden = true; rates.setAttribute('aria-expanded', 'false'); rates.focus(); } else close(true); }
    else if (event.key === 'ArrowLeft' && submenu.contains(event.target as Node)) { event.preventDefault(); submenu.hidden = true; rates.setAttribute('aria-expanded', 'false'); rates.focus(); }
    else if (event.key === 'ArrowRight' && event.target === rates) { event.preventDefault(); expand(true); }
    else if (event.key === 'Tab') close();
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const parent = submenu.contains(event.target as Node) ? submenu : node;
      const items = [...parent.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')].filter(item => !item.hidden);
      const index = items.indexOf(document.activeElement as HTMLButtonElement), direction = event.key === 'ArrowUp' ? -1 : 1;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + direction + items.length) % items.length;
      items[next]?.focus();
    }
  }
  node.onkeydown = keydown;
  const stop = (event: Event) => event.stopPropagation();
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel']) node.addEventListener(type, stop);
  node.oncontextmenu = event => { event.preventDefault(); event.stopPropagation(); };
  const outside = (event: Event) => { if (target && !node.contains(event.target as Node)) close(); };
  document.addEventListener('pointerdown', outside, true);
  const resize = new ResizeObserver(position); resize.observe(node);
  const unsubscribe = quality.subscribe(render);
  return {
    node,
    keydown,
    open(next: LabelMenuTarget, x: number, y: number, keyboard = false) {
      close(); target = next; next.lock(true); heading.textContent = next.name + (next.main ? ' · 当前' : ''); change.hidden = next.main;
      const bounds = node.parentElement!.getBoundingClientRect();
      node.style.left = `${x - bounds.left}px`; node.style.top = `${y - bounds.top}px`; node.hidden = false;
      render(); if (keyboard) rates.focus({ preventScroll: true });
    },
    close,
    check() { if (target && !valid()) close(); },
    dispose() { close(); unsubscribe(); resize.disconnect(); document.removeEventListener('pointerdown', outside, true); node.remove(); sheet.parentNode?.removeChild(sheet); },
  };
}
