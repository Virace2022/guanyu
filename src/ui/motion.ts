export function animateContent(node: HTMLElement, key: string) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let current = key;
  let animation: Animation | undefined;
  const onPreference = () => { if (preference.matches) animation?.cancel(); };
  preference.addEventListener('change', onPreference);
  return {
    update(next: string) {
      if (current === next) return;
      current = next;
      animation?.cancel();
      node.scrollTop = 0;
      if (preference.matches) return;
      animation = node.animate([
        { opacity: 0, transform: 'translateX(6px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    },
    destroy() { animation?.cancel(); preference.removeEventListener('change', onPreference); },
  };
}
