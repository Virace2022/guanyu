import type { TeamRoom } from './team';
import { diagnostics } from '../../core/diagnostics';

const borrowed = new WeakMap<HTMLElement, HTMLElement>();

export function teamCardElements(native: HTMLElement, selector: string) {
  return [...native.querySelectorAll<HTMLElement>(`${selector}, [data-guanyu-native-card-slot]`)]
    .map(node => borrowed.get(node) ?? node);
}

export function mountTeamCardPreview(native: () => HTMLElement | null) {
  let active: { root: HTMLElement; slot: HTMLElement; card: HTMLElement; link: HTMLElement; source: HTMLElement } | undefined;
  function restore() {
    if (!active) return;
    const value = active; active = undefined;
    value.source.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    if (value.slot.parentNode) value.slot.replaceWith(value.root);
    else value.root.remove();
    value.root.removeAttribute('data-guanyu-borrowed-card');
    borrowed.delete(value.slot);
    value.link.hidden = false; value.card.classList.remove('guanyu-team-preview-active');
  }
  const onVisibility = () => { if (document.hidden) restore(); };
  window.addEventListener('blur', restore);
  document.addEventListener('visibilitychange', onVisibility);
  return {
    restore,
    bind(card: HTMLElement, link: HTMLElement, room: TeamRoom) {
      card.addEventListener('pointerenter', event => {
        if (active?.card === card) return;
        restore();
        const root = room.element.closest<HTMLElement>('.wm-pc-room-button-dropdown')
          ?? (native()?.matches('.room-info') ? room.decoration : room.element.closest<HTMLElement>('a'));
        if (!root || !native()?.contains(root)) { diagnostics.report('team.hoverPreview', 'unmatched', '悬停时未找到名单内的 .wm-pc-room-button-dropdown / .room-info 原生卡片宿主'); return; }
        const slot = document.createElement('span'); slot.hidden = true; slot.dataset.guanyuNativeCardSlot = '';
        // 保留原位置的房间引用，悬停借走组件时名单识别不能少掉这个成员。
        borrowed.set(slot, room.element); root.before(slot);
        active = { root, slot, card, link, source: room.element };
        root.dataset.guanyuBorrowedCard = '';
        link.hidden = true; card.classList.add('guanyu-team-preview-active'); card.append(root);
        // 借用官方组件及事件，保留其 React 状态、预览播放器和弹层。
        room.element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null, clientX: event.clientX, clientY: event.clientY }));
        diagnostics.report('team.hoverPreview', 'ready', '已借用原生卡片并触发官方 mouseover，预览由官方组件加载');
      });
      card.addEventListener('pointerleave', restore);
    },
    dispose() { restore(); window.removeEventListener('blur', restore); document.removeEventListener('visibilitychange', onVisibility); },
  };
}
