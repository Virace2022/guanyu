import { isPlayerFullscreen } from './player';
import styles from '../../ui/quick-dock-page.css?style';
import { diagnostics } from '../../core/diagnostics';

export function attachQuickDock(host: HTMLElement) {
  const style = styles.cloneNode(true); document.head.append(style);
  let sidebar: Element | null = null;
  function setSidebar(next: Element | null) {
    if (sidebar === next) return;
    sidebar?.classList.remove('guanyu-snapbar-autohide');
    sidebar = next;
    sidebar?.classList.add('guanyu-snapbar-autohide');
  }
  function mount() {
    if (!document.getElementById('js-player-main')) {
      diagnostics.report('dock', 'unmatched', '未找到 #js-player-main，暂不挂载入口');
      host.hidden = true;
      host.remove();
      setSidebar(null);
      return;
    }
    const fullscreen = isPlayerFullscreen();
    const shield = document.querySelector<HTMLElement>('#js-player-controlbar [class^="shieldSetting-"]');
    const native = document.querySelector('#js-room-snapbar');
    setSidebar(native);
    const target = fullscreen ? shield?.parentElement : native || document.body;
    const hidden = fullscreen && (!shield || !!document.fullscreenElement && !document.fullscreenElement.contains(shield));
    host.hidden = hidden;
    host.toggleAttribute('data-player-controls', fullscreen);
    host.toggleAttribute('data-floating', !fullscreen && !native);
    if (!target || hidden) { diagnostics.report('dock', 'unmatched', '全屏内未找到可用的 #js-player-controlbar [class^="shieldSetting-"] 锚点'); return; }
    if (host.parentElement !== target || fullscreen && host.nextElementSibling !== shield) {
      if (fullscreen) target.insertBefore(host, shield!); else target.prepend(host);
    }
    diagnostics.report('dock', 'applied', fullscreen ? '已挂载到播放器全屏控制栏' : native ? '已挂载到官方侧边栏' : '已挂载右下角浮动入口');
  }
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('fullscreenchange', mount);
  mount();
  const timer = setInterval(mount, 1000);
  return () => { clearInterval(timer); observer.disconnect(); document.removeEventListener('fullscreenchange', mount); setSidebar(null); style.parentNode?.removeChild(style); host.remove(); };
}
