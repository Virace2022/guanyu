import type { SettingsStore } from '../../config/settings';
import type { TeamController } from '../../features/team-live/controller';
import { readRoomLayout } from './room-layout';
import { diagnostics } from '../../core/diagnostics';

export function mountTopBanner(settings: SettingsStore, team: TeamController) {
  const saved = new Map<HTMLElement, Map<string, string>>();
  function set(node: HTMLElement, property: string, value: string) {
    let properties = saved.get(node);
    if (!properties) { properties = new Map(); saved.set(node, properties); }
    if (!properties.has(property)) properties.set(property, node.style.getPropertyValue(property));
    if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
  }
  function restore() {
    for (const [node, properties] of saved) for (const [key, value] of properties) {
      if (value) node.style.setProperty(key, value); else node.style.removeProperty(key);
    }
    saved.clear();
  }
  let signature = '';
  let previous: HTMLElement[] = [];
  function sync() {
    const enabled = settings.runtime.value.optimization.hideTopBanner;
    const layout = readRoomLayout();
    if (!layout) { diagnostics.report('optimization.hideTopBanner', 'unmatched', '未识别播放器与内容根的布局关系：#js-player-main → #root / .layout-Main'); restore(); signature = ''; previous = []; return; }
    const candidates = [...document.querySelectorAll<HTMLElement>('.bacpCommonHeader.is-innerRoom, .wm-general, [id^="bc"][style*="background-image"]')]
      .filter(node => {
        if (!layout.root.contains(node) || layout.section.contains(node)
          || !(node.compareDocumentPosition(layout.section) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
        const outer = node.closest('.bc-wrapper') || node;
        if (team.value.source && outer.contains(team.value.source.native)) return false;
        const rect = node.getBoundingClientRect();
        return (saved.has(node) || rect.width >= 600 && rect.height >= 180) && !node.closest('#js-player-main');
      });
    const next = JSON.stringify([enabled, candidates.map(node => node.id || node.className), team.value.source?.activity]);
    if (next === signature && candidates.every((node, index) => node === previous[index])) return;
    restore(); signature = next; previous = candidates;
    if (!enabled) return;
    diagnostics.report('optimization.hideTopBanner', team.value.source ? 'idle' : candidates.length ? 'applied' : 'unmatched',
      team.value.source ? '团播顶图交由名单布局处理' : candidates.length ? '已匹配播放器上方的官方顶图，应用隐藏与占位调整' : '当前没有符合布局条件的顶图；选择器：.bacpCommonHeader.is-innerRoom / .wm-general / [id^="bc"][style*="background-image"]，继续观察');
    for (const node of candidates) {
      if (node.matches('.bacpCommonHeader')) { set(node, 'display', 'none'); continue; }
      const outer = node.closest<HTMLElement>('.bc-wrapper') || node;
      // Butterfly 图片层与房间按钮层分开，不能连带删除可点击内容。
      const content = outer.querySelector<HTMLElement>('.room-info, .wm-pc-room-button')?.parentElement;
      if (node.matches('[id^="bc"]') && node.querySelector(':scope > .wm-view') && !content?.contains(node)) set(node, 'display', 'none');
      else for (const background of [node, ...node.querySelectorAll<HTMLElement>(':scope > .wm-general-wrapper, :scope > .wm-general-bgblur')]) set(background, 'background-image', 'none');
      if (content && outer.contains(content)) {
        const top = Math.max(0, parseFloat(getComputedStyle(content).top) || 0);
        if (top > 48) { set(content, 'top', '48px'); set(outer, 'height', `${Math.max(96, outer.getBoundingClientRect().height - top + 48)}px`); }
      } else if (!node.querySelector('a,button,input,[role="button"]')) set(node, 'display', 'none');
    }
    window.dispatchEvent(new Event('resize'));
  }
  const stop = settings.runtime.subscribe(sync), stopTeam = team.subscribe(() => { signature = ''; sync(); }), timer = setInterval(sync, 1200);
  return () => { stop(); stopTeam(); clearInterval(timer); restore(); window.dispatchEvent(new Event('resize')); };
}
