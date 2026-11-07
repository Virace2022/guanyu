interface SortOptions {
  start(item: HTMLElement): boolean;
  over(target: HTMLElement, after: boolean): void;
  finish(cancelled: boolean): void;
}

export function pointerSort(node: HTMLElement, initial: SortOptions) {
  let options = initial;
  let active: { item: HTMLElement; handle: HTMLElement; pointer: number; x: number; y: number; startX: number; startY: number; scale: number; rect: DOMRect; floating?: HTMLElement } | undefined;
  let frame = 0;
  let suppressClick = false;
  const root = node.getRootNode() as ShadowRoot;
  const dialog = node.closest('dialog')!;

  function end(cancelled: boolean) {
    if (!active) return;
    cancelAnimationFrame(frame); frame = 0;
    active.item.classList.remove('sort-pressed', 'sort-placeholder');
    active.floating?.remove();
    if (node.hasPointerCapture(active.pointer)) node.releasePointerCapture(active.pointer);
    active = undefined; node.classList.remove('sorting');
    options.finish(cancelled);
  }

  function locate(x: number, y: number) {
    const hit = root.elementFromPoint(x, y) as HTMLElement | null;
    const target = hit?.closest<HTMLElement>('[data-sort-item], [data-sort-zone]');
    if (!target || !node.contains(target)) return;
    const rect = target.getBoundingClientRect();
    const parentStyle = target.parentElement ? getComputedStyle(target.parentElement) : undefined;
    const horizontal = parentStyle?.display === 'grid' || target.parentElement?.matches('.team-list') && parentStyle?.display === 'flex' && parentStyle.flexDirection === 'row';
    options.over(target, horizontal ? x > rect.left + rect.width / 2 : y > rect.top + rect.height / 2);
    for (let parent = hit; parent && parent !== node; parent = parent.parentElement) {
      const box = parent.getBoundingClientRect();
      const overflow = getComputedStyle(parent);
      const vertical = parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(overflow.overflowY);
      const lateral = parent.scrollWidth > parent.clientWidth && /auto|scroll/.test(overflow.overflowX);
      if (!vertical && !lateral) continue;
      const dy = vertical ? y < box.top + 32 ? -8 : y > box.bottom - 32 ? 8 : 0 : 0;
      const dx = lateral ? x < box.left + 32 ? -8 : x > box.right - 32 ? 8 : 0 : 0;
      parent.scrollBy(dx, dy);
      if (dx || dy) break;
    }
  }

  function render() {
    if (!active?.floating) return;
    active.floating.style.transform = `translate(${(active.x - active.startX) / active.scale}px, ${(active.y - active.startY) / active.scale}px)`;
    locate(active.x, active.y);
    frame = requestAnimationFrame(render);
  }

  function down(event: PointerEvent) {
    if (event.button !== 0 || active) return;
    if ((event.target as Element).closest('[data-sort-ignore], input, select, textarea')) return;
    const handle = (event.target as Element).closest<HTMLElement>('[data-drag-handle]');
    const item = handle?.closest<HTMLElement>('[data-sort-item]');
    if (!handle || !item || !node.contains(item) || !options.start(item)) return;
    (handle.matches('button') ? handle : item.querySelector<HTMLElement>('[data-card-focus]'))?.focus({ preventScroll: true });
    active = { item, handle, pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, scale: Number(getComputedStyle(dialog).zoom), rect: item.getBoundingClientRect() };
    item.classList.add('sort-pressed');
  }

  function move(event: PointerEvent) {
    if (!active || active.pointer !== event.pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    if (!active.floating && Math.hypot(active.x - active.startX, active.y - active.startY) >= 4) {
      node.setPointerCapture(event.pointerId);
      const floating = active.item.cloneNode(true) as HTMLElement;
      floating.classList.remove('sort-pressed'); floating.classList.add('sort-floating');
      floating.setAttribute('aria-hidden', 'true'); floating.inert = true;
      Object.assign(floating.style, { left: `${active.rect.left / active.scale}px`, top: `${active.rect.top / active.scale}px`, width: `${active.rect.width / active.scale}px`, height: `${active.rect.height / active.scale}px`, margin: '0' });
      const originalInputs = active.item.querySelectorAll('input');
      floating.querySelectorAll('input').forEach((input, index) => { input.value = originalInputs[index]!.value; });
      dialog.append(floating); active.floating = floating;
      active.item.classList.add('sort-placeholder'); node.classList.add('sorting');
      frame = requestAnimationFrame(render);
    }
    if (active.floating) {
      active.floating.style.transform = `translate(${(active.x - active.startX) / active.scale}px, ${(active.y - active.startY) / active.scale}px)`;
      locate(active.x, active.y);
    }
  }

  function up(event: PointerEvent) {
    if (active?.pointer !== event.pointerId) return;
    if (active.floating) {
      locate(event.clientX, event.clientY); suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    end(false);
  }
  function cancel() { end(true); }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !active) return;
    event.preventDefault(); event.stopPropagation(); end(true);
  }
  function preventNative(event: DragEvent) { event.preventDefault(); }
  function click(event: MouseEvent) { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }
  function key(event: KeyboardEvent) {
    if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); end(true); return; }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || active) return;
    const handle = (event.target as Element).closest<HTMLElement>('[data-drag-handle]');
    const item = handle?.closest<HTMLElement>('[data-sort-item]');
    if ((event.target as Element).closest('[data-sort-ignore]') || !item || !options.start(item)) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const sibling = next ? item.nextElementSibling : item.previousElementSibling;
    if (sibling instanceof HTMLElement && sibling.hasAttribute('data-sort-item')) options.over(sibling, next);
    options.finish(false); (handle?.matches('button') ? handle : item.querySelector<HTMLElement>('[data-card-focus]'))?.focus({ preventScroll: true });
  }

  node.addEventListener('pointerdown', down); window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up); node.addEventListener('pointercancel', cancel);
  node.addEventListener('click', click, true);
  node.addEventListener('dragstart', preventNative);
  dialog.addEventListener('keydown', key, true); dialog.addEventListener('close', cancel);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', escape, true);
  return {
    update(next: SortOptions) { options = next; },
    destroy() {
      end(true); node.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('click', click, true);
      node.removeEventListener('dragstart', preventNative);
      dialog.removeEventListener('keydown', key, true); dialog.removeEventListener('close', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape, true);
    },
  };
}
