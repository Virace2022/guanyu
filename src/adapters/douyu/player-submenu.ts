export interface PlayerSubmenu {
  element: HTMLUListElement;
  prepare?: () => void | Promise<unknown>;
}

export function mountPlayerSubmenu(item: HTMLElement, submenu: PlayerSubmenu, report: (message: string) => void) {
  const list = submenu.element;
  item.classList.add('subItem-11a1fb');
  item.setAttribute('aria-haspopup', 'menu'); item.setAttribute('aria-expanded', 'false');
  list.classList.add('menu-da2a9e', 'subMenu-de1c61', 'guanyu-submenu');
  list.setAttribute('role', 'menu'); list.style.visibility = 'hidden'; item.append(list);
  const enabled = () => item.getAttribute('aria-disabled') !== 'true';
  function position() {
    if (!item.parentElement || !enabled()) return;
    const player = item.closest('.layout-Player-video, .stream__T55I3')?.getBoundingClientRect();
    const right = Math.min(innerWidth, player?.right ?? innerWidth), bottom = Math.min(innerHeight, player?.bottom ?? innerHeight);
    const top = Math.max(0, player?.top ?? 0);
    list.style.left = `${item.offsetWidth - 2}px`; list.style.top = '0px'; list.style.maxHeight = `${Math.max(0, bottom - top)}px`;
    const rect = list.getBoundingClientRect();
    if (rect.right > right) list.style.left = `${2 - list.offsetWidth}px`;
    list.style.top = `${Math.max(top - rect.top, Math.min(0, bottom - rect.bottom))}px`;
  }
  function prepare() {
    if (!enabled()) return;
    list.style.visibility = ''; position(); item.setAttribute('aria-expanded', 'true');
    Promise.resolve().then(submenu.prepare).then(position).catch(error => report(String(error instanceof Error ? error.message : error)));
  }
  function expanded() { queueMicrotask(() => {
    if (item.getAttribute('aria-expanded') === 'false') return;
    const open = enabled() && item.matches(':hover, :focus-within');
    list.style.visibility = open ? '' : 'hidden'; item.setAttribute('aria-expanded', String(open));
  }); }
  function click(event: MouseEvent) {
    event.stopPropagation();
    if (!list.contains(event.target as Node) && enabled()) { prepare(); (list.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true }); }
  }
  function keydown(event: KeyboardEvent) {
    if (!enabled()) return;
    if (event.target === item && ['ArrowRight', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); prepare(); (list.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
    } else if (['ArrowLeft', 'Escape'].includes(event.key) && list.contains(event.target as Node)) {
      event.preventDefault(); event.stopPropagation(); list.style.visibility = 'hidden'; item.setAttribute('aria-expanded', 'false'); item.focus({ preventScroll: true });
    }
  }
  const resize = new ResizeObserver(() => { if (item.getAttribute('aria-expanded') === 'true') position(); }); resize.observe(list);
  // 官方在 document.mouseup 收起菜单，子菜单内的点击需先留给自身处理。
  const stopMouseup = (event: MouseEvent) => event.stopPropagation();
  item.addEventListener('mouseup', stopMouseup);
  item.addEventListener('mouseenter', prepare); item.addEventListener('mouseleave', expanded);
  const focusin = (event: FocusEvent) => { if (event.target !== item) prepare(); };
  item.addEventListener('focusin', focusin); item.addEventListener('focusout', expanded);
  item.addEventListener('click', click); item.addEventListener('keydown', keydown);
  return () => {
    resize.disconnect(); item.removeEventListener('mouseup', stopMouseup); item.removeEventListener('mouseenter', prepare); item.removeEventListener('mouseleave', expanded);
    item.removeEventListener('focusin', focusin); item.removeEventListener('focusout', expanded);
    item.removeEventListener('click', click); item.removeEventListener('keydown', keydown);
  };
}
