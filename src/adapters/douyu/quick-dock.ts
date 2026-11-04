import { isPlayerFullscreen } from './player';

export function attachQuickDock(host: HTMLElement, onMove: () => void) {
  function mount() {
    const fullscreen = isPlayerFullscreen();
    const shield = document.querySelector<HTMLElement>('#js-player-controlbar [class^="shieldSetting-"]');
    const native = document.querySelector('#js-room-snapbar');
    const target = fullscreen ? shield?.parentElement : native || document.body;
    const hidden = fullscreen && (!shield || !!document.fullscreenElement && !document.fullscreenElement.contains(shield));
    host.hidden = hidden;
    host.toggleAttribute('data-player-controls', fullscreen);
    host.toggleAttribute('data-floating', !fullscreen && !native);
    if (!target || hidden) { onMove(); return; }
    if (host.parentElement !== target || fullscreen && host.nextElementSibling !== shield) {
      if (host.isConnected) onMove();
      if (fullscreen) target.insertBefore(host, shield!); else target.prepend(host);
    }
  }
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('fullscreenchange', mount);
  mount();
  const timer = setInterval(mount, 1000);
  return () => { clearInterval(timer); observer.disconnect(); document.removeEventListener('fullscreenchange', mount); host.remove(); };
}
