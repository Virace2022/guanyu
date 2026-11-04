import type { SettingsStore } from '../../config/settings';
import type { PlayerStore } from '../../adapters/douyu/player';
import { BackpackApi, type BagGift, type FanBadge, type PocketItem, type MonthCost } from '../../adapters/douyu/backpack-api';
import { mountBackpackPage } from '../../adapters/douyu/backpack-page';
import { accountId, taskDay } from '../../adapters/douyu/task-request';
import { createState } from '../../core/state';

interface GlowPlan { uid: string; gift: number; name: string; available: number; each: number; total: number; rooms: FanBadge[] }
interface BackpackState { loading: boolean; error: string; gifts: BagGift[]; badges: FanBadge[]; pocket: PocketItem[]; vipDays: number | null; month: MonthCost | null; plan: GlowPlan | null; sending: boolean; results: string[] }
export function createBackpack(settings: SettingsStore, player: PlayerStore, open: () => void, confirm: (message: string) => Promise<boolean>) {
  const api = new BackpackApi();
  const state = createState<BackpackState>({ loading: false, error: '', gifts: [], badges: [], pocket: [], vipDays: null, month: null, plan: null, sending: false, results: [] });
  const dom = mountBackpackPage(open, () => { void refresh(); });
  let stopped = false, generation = 0, identity = '', lastOptions = '', nextAt = 0;
  function publish(next: Partial<BackpackState>) {
    if (stopped) return;
    state.set({ ...state.value, ...next });
    const value = state.value;
    dom.update({ ...value, month: value.month ? (value.month.total / 100).toFixed(2) : '' });
  }
  async function refresh() {
    const room = player.value.roomId, uid = accountId(), options = { ...settings.value.backpack }, revision = generation;
    if (!room || !uid || state.value.loading || stopped || state.value.sending) return;
    publish({ loading: true, error: '' });
    const errors: string[] = [];
    const current = () => !stopped && generation === revision && uid === accountId() && room === player.value.roomId;
    async function load<T>(enabled: boolean, label: string, read: () => Promise<T>, result: (value: T) => Partial<BackpackState>) {
      if (!enabled) return;
      try { const value = await read(); if (current()) publish(result(value)); }
      catch (cause) { if (current()) errors.push(`${label}：${cause instanceof Error ? cause.message : String(cause)}`); }
    }
    await Promise.all([
      load(options.details || options.glow, '背包', () => api.bag(room), gifts => ({ gifts })),
      load(options.badgeDays || options.glow, '粉丝牌', () => api.badges(), badges => ({ badges })),
      load(options.pocket, '主播口袋', () => api.pocket(room), pocket => ({ pocket })),
      load(options.vipExpiry, 'VIP', () => api.vip(room), vipDays => ({ vipDays })),
      load(options.monthCost, '月消费', async () => {
        const key = `guanyu:month-cost:v1:${uid}`;
        const raw = localStorage.getItem(key), saved = raw ? JSON.parse(raw) as MonthCost : null;
        if (saved?.uid === uid && saved.date === taskDay()) return saved;
        const value = await api.month(); if (current()) localStorage.setItem(key, JSON.stringify(value)); return value;
      }, month => ({ month })),
    ]);
    if (current()) { publish({ loading: false, error: errors.join('；') }); nextAt = Date.now() + 60000; }
  }
  async function prepare() {
    if (!settings.value.backpack.glow || stopped || state.value.sending) return;
    const uid = accountId(), room = player.value.roomId, revision = generation;
    if (!uid || !room) { publish({ error: '请先登录并进入真实直播间' }); return; }
    publish({ loading: true, error: '', plan: null, results: [] });
    try {
      const gifts = await api.bag(room), rooms = await api.badges();
      if (stopped || revision !== generation || uid !== accountId()) return;
      const gift = gifts.find(gift => [268, 2358].includes(Number(gift.id)) && Number(gift.count) > 0);
      if (!gift) throw new Error('背包中没有可赠送的荧光棒');
      if (!rooms.length) throw new Error('没有粉丝牌房间可供续牌');
      const count = settings.value.backpack.glowCount || Math.floor(Number(gift.count) / rooms.length);
      if (count < 1) throw new Error('荧光棒不足以向每个房间平均赠送 1 根');
      if (count * rooms.length > Number(gift.count)) throw new Error(`计划需 ${count * rooms.length} 根，当前只有 ${gift.count} 根`);
      publish({ gifts, badges: rooms, plan: { uid, gift: Number(gift.id), name: gift.name, available: Number(gift.count), each: count, total: count * rooms.length, rooms } });
    } catch (cause) { publish({ error: cause instanceof Error ? cause.message : String(cause) }); }
    finally { if (revision === generation) publish({ loading: false }); }
  }
  async function send() {
    const plan = state.value.plan, revision = generation;
    if (!plan || state.value.sending || !settings.value.backpack.glow) return;
    if (!await confirm(`将向 ${plan.rooms.length} 个粉丝牌房间每房赠送 ${plan.each} 根${plan.name}，合计 ${plan.total} 根。目标：${plan.rooms.map(room => `${room.name}（${room.id}）`).join('、')}。仅使用背包道具，不购买礼物。`)) return;
    if (stopped || state.value.sending || state.value.plan !== plan || revision !== generation || plan.uid !== accountId() || !settings.value.backpack.glow) return;
    publish({ sending: true, error: '', results: [] });
    try {
      const gifts = await api.bag(player.value.roomId || plan.rooms[0]!.id);
      if (Number(gifts.find(gift => Number(gift.id) === plan.gift)?.count || 0) < plan.total) throw new Error('荧光棒数量已变化，请重新生成计划');
      for (const room of plan.rooms) {
        if (stopped || revision !== generation || plan.uid !== accountId() || !settings.value.backpack.glow) break;
        await api.donate(plan.gift, plan.each, room.id);
        publish({ results: [...state.value.results, `${room.name}（${room.id}）：已赠送 ${plan.each} 根`] });
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } catch (cause) { publish({ error: `${cause instanceof Error ? cause.message : String(cause)}；已停止后续赠送，不自动重发` }); }
    finally { publish({ sending: false, plan: null }); void refresh(); }
  }
  function sync() {
    const nextIdentity = `${accountId()}:${player.value.roomId || ''}`, nextOptions = JSON.stringify(settings.value.backpack);
    dom.apply(settings.value.backpack);
    if (identity === nextIdentity && lastOptions === nextOptions) return;
    const accountChanged = identity.split(':')[0] !== accountId();
    identity = nextIdentity; lastOptions = nextOptions; generation++; api.close(); nextAt = 0;
    publish({ loading: false, plan: null, vipDays: null, pocket: [], ...(accountChanged ? { gifts: [], badges: [], month: null, results: [], error: '' } : {}) });
    void refresh();
  }
  const stopSettings = settings.subscribe(sync), stopPlayer = player.subscribe(sync);
  const timer = setInterval(() => { sync(); if (!document.hidden && Date.now() >= nextAt) void refresh(); }, 1000);
  return { ...state, get value() { return state.value; }, refresh, prepare, send,
    dispose() { stopped = true; generation++; clearInterval(timer); stopSettings(); stopPlayer(); api.close(); dom.dispose(); } };
}
export type BackpackController = ReturnType<typeof createBackpack>;
