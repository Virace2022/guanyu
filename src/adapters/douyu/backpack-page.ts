import type { BackpackOptions } from '../../config/enhancements';
import type { BagGift, FanBadge, PocketItem } from './backpack-api';

export interface BackpackPageData { gifts: BagGift[]; badges: FanBadge[]; pocket: PocketItem[]; vipDays: number | null; month: string }
export function mountBackpackPage(open: () => void, refresh: () => void) {
  const entry = document.createElement('button'); entry.type = 'button'; entry.className = 'guanyu-backpack-entry'; entry.textContent = '背包增强'; entry.onclick = open;
  const summary = document.createElement('div'); summary.className = 'guanyu-backpack-summary';
  const metrics = document.createElement('div'); metrics.className = 'guanyu-backpack-metrics';
  const intimateItem = document.createElement('div'); intimateItem.className = 'InteractABAd-valueInfo--item guanyu-backpack-intimacy';
  const monthItem = document.createElement('div'); monthItem.className = 'InteractABAd-valueInfo--item guanyu-backpack-month';
  metrics.append(intimateItem, monthItem);
  const pocket = document.createElement('div'); pocket.className = 'guanyu-pocket';
  const expiry = new Set<HTMLElement>(), badgeDays = new Set<HTMLElement>();
  let options: BackpackOptions, data: BackpackPageData = { gifts: [], badges: [], pocket: [], vipDays: null, month: '' }, signature = '';
  let previousPanel: Element | null = null;
  function sync() {
    if (!options) return;
    const enabled = Object.entries(options).some(([key, value]) => key !== 'glowCount' && value);
    const panel = document.querySelector('.BackpackExpandPanel-backpackHeader, .BackpackHeader-extInfo');
    if (panel && enabled) { if (entry.parentElement !== panel) panel.append(entry); }
    else entry.remove();
    if (panel && options.details) { if (summary.parentElement !== panel) panel.insertBefore(summary, entry.parentElement === panel ? entry : null); }
    else summary.remove();
    let price = 0, intimate = 0;
    for (const gift of data.gifts) { if (Number(gift.isValuable) === 1) price += Number(gift.price) * Number(gift.count); intimate += Number(gift.intimate) * Number(gift.count); }
    const text = [`背包价值 ¥${(price / 100).toFixed(2)}`,
      ...(options.vipExpiry && data.vipDays !== null ? [`本房 VIP 剩余 ${data.vipDays} 天`] : [])].join('　');
    if (summary.textContent !== text) summary.textContent = text;
    const wealth = document.querySelector('.InteractABAd-valueInfo') ?? document.querySelector('.PlayerToolbar-Wealth');
    const fishball = wealth?.querySelector('.is-yw')?.parentElement;
    if (wealth && (options.details || options.monthCost)) {
      if (metrics.parentElement !== wealth || (fishball && metrics.nextElementSibling !== fishball)) wealth.insertBefore(metrics, fishball ?? wealth.firstChild);
    } else metrics.remove();
    intimateItem.hidden = !options.details; monthItem.hidden = !options.monthCost;
    const intimacyText = `亲密度 ${intimate}`, monthText = `本月消费 ${data.month ? `¥${data.month}` : '读取中…'}`;
    if (intimateItem.textContent !== intimacyText) intimateItem.textContent = intimacyText;
    if (monthItem.textContent !== monthText) monthItem.textContent = monthText;
    const items = [...document.querySelectorAll<HTMLElement>('.ToolbarBackpack-giftItem, .Backpack-prop')];
    for (const node of expiry) if (!options.details || !node.isConnected) { node.remove(); expiry.delete(node); }
    if (options.details) items.forEach((item, index) => {
      const gift = item.dataset.propid ? data.gifts.find(gift => String(gift.id) === item.dataset.propid) : data.gifts[index]; if (!gift) return;
      let label = item.querySelector<HTMLElement>('.guanyu-backpack-expiry');
      if (!label) { label = document.createElement('span'); label.className = 'guanyu-backpack-expiry'; item.append(label); expiry.add(label); }
      label.textContent = Number(gift.met) > 0 ? `${Math.max(0, Number(gift.expiry) - 1)}天` : '长期';
      label.title = Number(gift.met) > 0 ? `到期：${new Date(Number(gift.met) * 1000).toLocaleString()}` : '长期有效';
    });
    for (const node of badgeDays) if (!options.badgeDays || !node.isConnected) { node.remove(); badgeDays.delete(node); }
    if (options.badgeDays) for (const row of document.querySelectorAll<HTMLElement>('.fans-badge-list [data-fans-room]')) {
      const since = Number(row.dataset.fansGbdgts) * 1000, cell = row.querySelector('td:nth-child(2)');
      if (!cell || !(since > 0) || cell.querySelector('.guanyu-badge-days')) continue;
      const label = document.createElement('div'); label.className = 'guanyu-badge-days'; label.textContent = `已持有 ${Math.floor((Date.now() - since) / 86400000)} 天`;
      label.title = new Date(since).toLocaleString(); cell.append(label); badgeDays.add(label);
    }
    const head = document.querySelector('.FansMedalInfo-head');
    if (options.pocket && head && data.pocket.length) { if (pocket.parentElement !== head) head.append(pocket); } else pocket.remove();
    const next = JSON.stringify(data.pocket);
    if (signature !== next) {
      signature = next; pocket.replaceChildren();
      for (const item of data.pocket) { const span = document.createElement('span'), image = document.createElement('img'); image.src = item.webIcon; image.alt = ''; span.append(image, item.name); span.title = item.intro; pocket.append(span); }
    }
    if (panel !== previousPanel) { previousPanel = panel; if (panel && enabled) refresh(); }
  }
  const timer = setInterval(sync, 1000);
  return {
    apply(value: BackpackOptions) { options = value; sync(); }, update(value: BackpackPageData) { data = value; sync(); },
    dispose() { clearInterval(timer); entry.remove(); summary.remove(); metrics.remove(); pocket.remove(); for (const node of [...expiry, ...badgeDays]) node.remove(); },
  };
}
