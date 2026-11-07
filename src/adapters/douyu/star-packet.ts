import { createState } from '../../core/state';

function findPacket(): { node: HTMLElement; label: string } | undefined {
  for (const label of document.querySelectorAll<HTMLElement>('span')) {
    const text = label.textContent?.trim() || '';
    if (!['领红包', '可领取', '倒计时'].includes(text)) continue;
    const fiberKey = Object.keys(label).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
    let fiber = fiberKey ? (label as any)[fiberKey] : undefined;
    for (let depth = 0; fiber && depth < 10; depth++, fiber = fiber.return) {
      const callback = fiber.memoizedProps?.onClick;
      if (typeof callback !== 'function') continue;
      const source = callback.toString();
      // 沿用官方星推荐红包事件；普通宝箱也会显示相同文字，不能仅凭颜色或标签判断。
      if (!source.includes('OPEN_NEW_ANCHOR_SUPPORT_TREASURE_BOX')) continue;
      const node = label.closest<HTMLElement>('[class*="container__"]');
      if (node) return { node, label: node.innerText.trim().replace(/\s+/g, ' ') || text };
    }
  }
}

export function observeStarPacket() {
  const state = createState({ available: false, visible: false, status: '本房间暂未出现星推荐红包入口' });
  function update() {
    const packet = findPacket();
    const next = packet ? { available: true, visible: packet.node.getBoundingClientRect().width > 0,
      status: `${packet.label}；点击复用官方红包面板` } : { available: false, visible: false, status: '本房间暂未出现星推荐红包入口' };
    if (JSON.stringify(next) !== JSON.stringify(state.value)) state.set(next);
  }
  update();
  const timer = setInterval(update, 1500);
  return { ...state, get value() { return state.value; },
    open() {
      const packet = findPacket();
      if (!packet) { update(); return; }
      packet.node.click();
    },
    dispose: () => clearInterval(timer),
  };
}
