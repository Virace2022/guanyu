import type { BackpackOptions } from '../../config/enhancements';
import type { BagGift, FanBadge, PocketItem, MonthCost } from './backpack-api';
import { createIcon } from '../../ui/icons';

export interface BackpackPageData { gifts: BagGift[]; badges: FanBadge[]; pocket: PocketItem[]; vipDays: number | null; month: MonthCost | null; roomId: string; uid: string }
export function mountBackpackPage(open: () => void, refresh: () => void, openGlow: () => void) {
  const entry = document.createElement('button'); entry.type = 'button'; entry.className = 'guanyu-backpack-entry'; entry.textContent = '背包增强'; entry.onclick = open;
  const summary = document.createElement('div'); summary.className = 'guanyu-backpack-summary';
  const monthItem = document.createElement('div'); monthItem.className = 'InteractABAd-valueInfo--item guanyu-backpack-month';
  const monthIcon = document.createElement('i'); monthIcon.className = 'guanyu-month-icon'; monthIcon.append(createIcon('wallet'));
  const monthLabel = document.createElement('span'); monthLabel.className = 'is-unit'; monthLabel.textContent = '本月消费\u00a0';
  const monthText = document.createElement('span'), monthToggle = document.createElement('button'); monthToggle.type = 'button'; monthToggle.className = 'guanyu-month-toggle';
  monthText.className = 'guanyu-month-value';
  monthItem.append(monthIcon, monthLabel, monthText, monthToggle);
  const vip = document.createElement('span'); vip.className = 'guanyu-backpack-vip';
  const glow = document.createElement('button'); glow.type = 'button'; glow.className = 'guanyu-glow-entry'; glow.title = '荧光棒续牌'; glow.setAttribute('aria-label', '荧光棒续牌'); glow.append(createIcon('glow')); glow.onclick = openGlow;
  const currentBadge = document.createElement('span'); currentBadge.className = 'guanyu-chat-badge-days';
  const pocket = document.createElement('div'); pocket.className = 'guanyu-pocket';
  const expiry = new Set<HTMLElement>(), badgeDays = new Set<HTMLElement>();
  let options: BackpackOptions, data: BackpackPageData = { gifts: [], badges: [], pocket: [], vipDays: null, month: null, roomId: '', uid: '' }, signature = '';
  let visible = false, identity = '';
  const visibilityKey = () => `guanyu:month-cost:visible:v1:${data.uid}`;
  function renderMonth() {
    monthText.textContent = visible ? data.month ? `¥${(data.month.total / 100).toFixed(2)}` : '读取中…' : '•••';
    monthText.setAttribute('aria-label', visible ? monthText.textContent : '金额已隐藏');
    monthToggle.replaceChildren(createIcon(visible ? 'eye' : 'eyeOff'));
    monthToggle.setAttribute('aria-label', visible ? '隐藏本月消费金额' : '显示本月消费金额'); monthToggle.title = monthToggle.getAttribute('aria-label')!;
    monthToggle.setAttribute('aria-pressed', String(visible));
    monthItem.title = visible && data.month ? `按账号每日汇总\n${data.month.details.map(item => `${item.name}：¥${(item.amount / 100).toFixed(2)}`).join('\n')}` : '本月消费，点击眼睛查看或隐藏金额';
  }
  monthToggle.onclick = () => {
    visible = !visible; renderMonth();
    try { localStorage.setItem(visibilityKey(), String(visible)); }
    catch { monthToggle.title = '本页显隐已切换，未能保存偏好'; }
  };
  const onStorage = (event: StorageEvent) => { if (event.key === visibilityKey() || event.key === null) { visible = localStorage.getItem(visibilityKey()) === 'true'; renderMonth(); } };
  window.addEventListener('storage', onStorage);
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
    const text = `背包价值 ¥${(price / 100).toFixed(2)}　总亲密度 ${intimate}`;
    if (summary.textContent !== text) summary.textContent = text;
    if (panel && options.vipExpiry && data.vipDays !== null) { vip.textContent = `本房 VIP 剩余 ${data.vipDays} 天`; if (vip.parentElement !== panel) panel.append(vip); } else vip.remove();
    const wealth = document.querySelector('.InteractABAd-valueInfo') ?? document.querySelector('.PlayerToolbar-Wealth');
    const fishball = wealth?.querySelector('.is-yw')?.parentElement;
    if (wealth && options.monthCost) {
      if (monthItem.parentElement !== wealth || (fishball && monthItem.nextElementSibling !== fishball)) wealth.insertBefore(monthItem, fishball ?? wealth.firstChild);
    } else monthItem.remove();
    const nativeUnit = wealth?.querySelector<HTMLElement>('.InteractABAd-valueInfo--item:not(.guanyu-backpack-month) .is-unit');
    if (nativeUnit) {
      const color = getComputedStyle(nativeUnit).color;
      monthItem.style.setProperty('--guanyu-native-muted', color);
      currentBadge.style.setProperty('--guanyu-native-muted', color);
    }
    const recharge = document.querySelector('#js-player-toolbar .InteractABAd-recharge, #js-player-toolbar .ToolbarRechargeModule');
    if (options.glow && recharge?.parentElement) { if (glow.nextElementSibling !== recharge) recharge.before(glow); } else glow.remove();
    const badge = data.badges.find(item => item.id === data.roomId), toolbar = document.querySelector('.ChatToolBar'), right = toolbar?.querySelector('.ChatToolBar__right');
    if (options.badgeDays && badge && badge.since > 0 && toolbar && right) {
      currentBadge.textContent = `牌龄 ${badge.days} 天`; currentBadge.title = `本房粉丝牌获得于 ${new Date(badge.since).toLocaleString()}`;
      if (currentBadge.parentElement !== toolbar || currentBadge.nextElementSibling !== right) toolbar.insertBefore(currentBadge, right);
    } else currentBadge.remove();
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
      label.classList.toggle('guanyu-badge-milestone', Math.floor((Date.now() - since) / 86400000) >= 300);
      const date = document.createElement('span'); date.className = 'guanyu-badge-date'; date.textContent = new Date(since).toLocaleString(); label.append(document.createElement('br'), date);
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
    apply(value: BackpackOptions) { options = value; sync(); }, update(value: BackpackPageData) {
      data = value;
      if (identity !== value.uid) { identity = value.uid; try { visible = localStorage.getItem(visibilityKey()) === 'true'; } catch { visible = false; } }
      renderMonth(); sync();
    },
    dispose() { clearInterval(timer); window.removeEventListener('storage', onStorage); entry.remove(); summary.remove(); monthItem.remove(); vip.remove(); glow.remove(); currentBadge.remove(); pocket.remove(); for (const node of [...expiry, ...badgeDays]) node.remove(); },
  };
}
