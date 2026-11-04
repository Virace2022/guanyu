import type { OptimizationOptions } from '../../config/options';
import styles from '../../ui/page-tools.css?style';

const classes: Record<keyof OptimizationOptions, string> = {
  hideAds: 'guanyu-hide-ads',
  hideTopBanner: 'guanyu-hide-top-banner',
  hideGiftBar: 'guanyu-hide-gift-bar', hidePk: 'guanyu-hide-pk', hideActivities: 'guanyu-hide-activities',
  collapseChat: 'guanyu-chat-collapsed', autoHideHeader: 'guanyu-auto-header',
};

export function mountPageTools(toggleChat: () => void) {
  const root = document.documentElement;
  const style = styles.cloneNode(true) as HTMLStyleElement;
  style.id = 'guanyu-page-tools-style';
  document.head.append(style);
  let options: OptimizationOptions;
  let rank: Element | null = null;
  let previousY = Math.max(0, scrollY), direction = 0, distance = 0;
  let frame = 0;
  let mirrored = false;
  const summary = document.createElement('div'); summary.className = 'guanyu-chat-summary';
  const counts = document.createElement('span'); counts.className = 'guanyu-chat-counts';
  const restore = document.createElement('button'); restore.textContent = '恢复活动区'; restore.type = 'button'; restore.className = 'guanyu-chat-restore';
  const collapse = document.createElement('button'); collapse.textContent = '收起活动区'; collapse.type = 'button'; collapse.className = 'guanyu-chat-collapse';
  const status = document.createElement('span'); status.className = 'guanyu-page-error'; status.setAttribute('role', 'status');
  summary.append(counts, restore);

  function toggle(event: MouseEvent) {
    event.stopPropagation();
    try { toggleChat(); status.textContent = ''; }
    catch (error) { status.textContent = `未能保存：${String(error)}`; }
  }
  restore.onclick = collapse.onclick = toggle;
  const rankObserver = new MutationObserver(syncChat);

  function syncPage() {
    if (!options) return;
    let changed = !style.isConnected;
    if (changed) document.head.append(style);
    for (const key of Object.keys(classes) as (keyof OptimizationOptions)[]) {
      if (root.classList.contains(classes[key]) === options[key]) continue;
      root.classList.toggle(classes[key], options[key]); changed = true;
    }
    if (root.classList.contains('guanyu-video-mirror') !== mirrored) root.classList.toggle('guanyu-video-mirror', mirrored);
    syncChat();
    if (changed) window.dispatchEvent(new Event('resize'));
  }
  const pageObserver = new MutationObserver(syncPage);
  pageObserver.observe(root, { attributes: true, attributeFilter: ['class'], childList: true });
  pageObserver.observe(document.head, { childList: true });

  function syncChat() {
    const nextRank = document.querySelector('.layout-Player-rank');
    if (nextRank !== rank) {
      rankObserver.disconnect(); rank = nextRank;
      if (rank) rankObserver.observe(rank, { childList: true, subtree: true, characterData: true });
    }
    const stage = document.querySelector('.layout-Player-barrageStage');
    if (stage && summary.parentElement !== stage) stage.prepend(summary);
    // 榜单内容会懒加载和隐藏，入口挂在常驻标题行，避免首次进入时落入不可见面板。
    const toolbar = rank?.querySelector('.ChatTabContainer-titleWraper') ?? rank?.querySelector('.DiamondsFansRankInfo');
    if (toolbar && collapse.parentElement !== toolbar) toolbar.append(collapse);
    const nativeButton = rank?.querySelector<HTMLElement>('.DiamondsFansRankInfo-diamondsFansIcon:not(.guanyu-chat-collapse)');
    if (nativeButton) {
      const nativeClass = nativeButton.className.trim();
      const font = getComputedStyle(nativeButton).font;
      if (collapse.className !== `${nativeClass} guanyu-chat-collapse`) collapse.className = `${nativeClass} guanyu-chat-collapse`;
      if (restore.className !== `${nativeClass} guanyu-chat-restore`) restore.className = `${nativeClass} guanyu-chat-restore`;
      collapse.style.setProperty('--guanyu-native-button-font', font);
      restore.style.setProperty('--guanyu-native-button-font', font);
    } else {
      collapse.className = 'guanyu-chat-collapse guanyu-chat-fallback';
      restore.className = 'guanyu-chat-restore guanyu-chat-fallback';
    }
    const values: string[] = [];
    rank?.querySelectorAll('.ChatRank-tabTitle').forEach(tab => {
      const match = tab.textContent?.match(/^\s*(贵宾|钻粉)\s*[（(]([^）)]+)[）)]/);
      if (match) values.push(`${match[1]} ${match[2]!.trim()}`);
    });
    const text = values.join('　') || '聊天活动区';
    if (counts.textContent !== text) counts.textContent = text;
    summary.hidden = !options?.collapseChat;
    collapse.hidden = !!options?.collapseChat;
    const target = options?.collapseChat ? summary : toolbar;
    if (target && status.parentElement !== target) target.append(status);
  }

  function showHeader() {
    root.classList.remove('guanyu-header-hidden'); direction = distance = 0;
  }

  function updateHeader() {
    frame = 0;
    const y = Math.max(0, scrollY), delta = y - previousY; previousY = y;
    if (!options?.autoHideHeader || y <= 8 || document.fullscreenElement
      || document.querySelector('#guanyu-settings')?.shadowRoot?.querySelector('dialog[open]')
      || document.querySelector('#guanyu-team-editor')?.shadowRoot?.querySelector('dialog[open]')) { showHeader(); return; }
    const next = Math.sign(delta);
    if (!next) return;
    if (direction !== next) { direction = next; distance = 0; }
    distance += Math.abs(delta);
    if (distance >= (direction > 0 ? 8 : 160)) root.classList.toggle('guanyu-header-hidden', direction > 0);
  }
  function onScroll() { if (!frame) frame = requestAnimationFrame(updateHeader); }
  function onFocus(event: FocusEvent) {
    if (event.target instanceof Element && event.target.closest('.Header-wrap, .layout-Header')) showHeader();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', syncChat);
  document.addEventListener('fullscreenchange', showHeader);
  document.addEventListener('focusin', onFocus);
  const timer = setInterval(syncPage, 1000);

  return {
    apply(value: OptimizationOptions, mirror: boolean, accentColor: string) {
      options = value;
      mirrored = mirror;
      summary.style.setProperty('--guanyu-page-accent', accentColor);
      collapse.style.setProperty('--guanyu-page-accent', accentColor);
      if (!value.autoHideHeader) showHeader();
      syncPage();
      window.dispatchEvent(new Event('resize'));
    },
    dispose() {
      clearInterval(timer); cancelAnimationFrame(frame); rankObserver.disconnect(); pageObserver.disconnect();
      window.removeEventListener('scroll', onScroll); document.removeEventListener('fullscreenchange', showHeader); document.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', syncChat);
      root.classList.remove(...Object.values(classes), 'guanyu-header-hidden', 'guanyu-video-mirror');
      summary.remove(); collapse.remove(); status.remove(); style.parentNode?.removeChild(style);
      window.dispatchEvent(new Event('resize'));
    },
  };
}
