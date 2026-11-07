export function attachEdgeDrag(handle: HTMLElement, panel: HTMLElement, position: { ratio: number }) {
  let drag: { id: number; y: number; top: number; moved: boolean } | undefined;
  let suppressClick = false;
  const bounds = () => ({ min: 8, max: Math.max(8, innerHeight - panel.offsetHeight - 8) });
  function move(top: number) {
    const { min, max } = bounds();
    const next = Math.min(max, Math.max(min, top));
    panel.style.top = `${next}px`;
    position.ratio = max > min ? (next - min) / (max - min) : 0;
  }
  function resize() {
    const { min, max } = bounds();
    move(min + position.ratio * (max - min));
  }
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    drag = { id: event.pointerId, y: event.clientY, top: panel.getBoundingClientRect().top, moved: false };
    handle.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientY - drag.y) < 4) return;
    drag.moved = true;
    panel.dataset.dragging = 'true';
    move(drag.top + event.clientY - drag.y);
    event.preventDefault();
  }
  function up(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    drag = undefined;
    delete panel.dataset.dragging;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  function click(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function key(event: KeyboardEvent) {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const { min, max } = bounds();
    move(event.key === 'Home' ? min : event.key === 'End' ? max : panel.getBoundingClientRect().top + (event.key === 'ArrowUp' ? -24 : 24));
  }
  handle.addEventListener('pointerdown', down);
  handle.addEventListener('pointermove', pointerMove);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  handle.addEventListener('lostpointercapture', up);
  handle.addEventListener('click', click, true);
  handle.addEventListener('keydown', key);
  window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize);
  observer.observe(panel);
  resize();
  return () => {
    handle.removeEventListener('pointerdown', down);
    handle.removeEventListener('pointermove', pointerMove);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    handle.removeEventListener('lostpointercapture', up);
    handle.removeEventListener('click', click, true);
    handle.removeEventListener('keydown', key);
    window.removeEventListener('resize', resize);
    observer.disconnect();
  };
}
