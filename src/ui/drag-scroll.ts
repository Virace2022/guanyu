export function dragScroll(node: HTMLElement) {
  let frame = 0, x = 0, y = 0;
  const stop = () => { cancelAnimationFrame(frame); frame = 0; x = y = 0; };
  function scroll() { node.scrollBy(x, y); frame = requestAnimationFrame(scroll); }
  function over(event: DragEvent) {
    const rect = node.getBoundingClientRect(), edge = 32;
    x = node.scrollWidth > node.clientWidth ? event.clientX < rect.left + edge ? -8 : event.clientX > rect.right - edge ? 8 : 0 : 0;
    y = node.scrollHeight > node.clientHeight ? event.clientY < rect.top + edge ? -8 : event.clientY > rect.bottom - edge ? 8 : 0 : 0;
    if ((x || y) && !frame) frame = requestAnimationFrame(scroll); else if (!x && !y) stop();
  }
  node.addEventListener('dragover', over); node.addEventListener('dragleave', stop);
  document.addEventListener('dragend', stop); document.addEventListener('drop', stop);
  return { destroy() { stop(); node.removeEventListener('dragover', over); node.removeEventListener('dragleave', stop); document.removeEventListener('dragend', stop); document.removeEventListener('drop', stop); } };
}
