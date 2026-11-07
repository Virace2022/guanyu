import type { SettingsStore } from '../../config/settings';
import type { PlayerStore } from '../../adapters/douyu/player';
import { BackpackApi, type BagGift, type FanBadge, type PocketItem, type MonthCost } from '../../adapters/douyu/backpack-api';
import { mountBackpackPage } from '../../adapters/douyu/backpack-page';
import { accountId, taskDay } from '../../adapters/douyu/task-request';
import { createState } from '../../core/state';
import { RoomApi } from '../../adapters/douyu/rooms';

interface BadgeRoom extends FanBadge { avatar: string }
interface GlowPlan { uid: string; gift: number; name: string; available: number; each: number; total: number; rooms: BadgeRoom[]; avatarError: string }
interface GlowDelivery { status: 'sending' | 'sent' | 'failed'; error?: string }
interface BackpackState { loading: boolean; error: string; gifts: BagGift[]; badges: BadgeRoom[]; avatarError: string; pocket: PocketItem[]; vipDays: number | null; month: MonthCost | null; plan: GlowPlan | null; preparing: boolean; glowError: string; sendError: string; sending: boolean; deliveries: Record<string, GlowDelivery>; sent: Record<string, number> }
export function createBackpack(settings: SettingsStore, player: PlayerStore, open: () => void, openGlow: () => void) {
  const api = new BackpackApi();
  const roomApi = new RoomApi();
  const avatars = new Map<string, string>();
  const state = createState<BackpackState>({ loading: false, error: '', gifts: [], badges: [], avatarError: '', pocket: [], vipDays: null, month: null, plan: null, preparing: false, glowError: '', sendError: '', sending: false, deliveries: {}, sent: {} });
  const dom = mountBackpackPage(open, () => { void refresh(); }, openGlow);
  let stopped = false, generation = 0, identity = '', lastOptions = '', nextAt = 0;
  async function badgeRooms(badges: FanBadge[]) {
    let avatarError = '';
    const missing = badges.filter(room => !avatars.has(room.id));
    if (missing.length) {
      try { for (const room of await roomApi.info(missing.map(room => room.id))) avatars.set(String(room.rid), room.avt); }
      catch (cause) { avatarError = `头像未能读取：${cause instanceof Error ? cause.message : String(cause)}`; }
    }
    return { rooms: badges.map(room => ({ ...room, avatar: avatars.get(room.id) || '' })), avatarError };
  }
  function publish(next: Partial<BackpackState>) {
    if (stopped) return;
    state.set({ ...state.value, ...next });
    const value = state.value;
    dom.update({ ...value, uid: accountId(), roomId: player.value.roomId || '' });
  }
  async function refresh() {
    const room = player.value.roomId, uid = accountId(), options = { ...settings.value.backpack }, revision = generation;
    const optionSignature = JSON.stringify(options);
    if (!room || !uid || state.value.loading || stopped || state.value.sending || state.value.preparing) return;
    publish({ loading: true, error: '' });
    const errors: string[] = [];
    const current = () => !stopped && generation === revision && uid === accountId() && room === player.value.roomId;
    async function load<T>(enabled: boolean, label: string, read: () => Promise<T>, result: (value: T) => Partial<BackpackState>) {
      if (!enabled) return;
      try { const value = await read(); if (current()) publish(result(value)); }
      catch (cause) { if (current()) errors.push(`${label}：${cause instanceof Error ? cause.message : String(cause)}`); }
    }
    await Promise.all([
      load(options.details || options.glow, '背包', () => api.bag(room), gifts => {
        const plan = state.value.plan;
        return { gifts, ...(plan && Object.keys(state.value.deliveries).length ? { plan: { ...plan, available: Number(gifts.find(gift => Number(gift.id) === plan.gift)?.count || 0) } } : {}) };
      }),
      load(options.badgeDays || options.glow, '粉丝牌', async () => badgeRooms(await api.badges()), result => ({ badges: result.rooms, avatarError: result.avatarError })),
      load(options.pocket, '主播口袋', () => api.pocket(room), pocket => ({ pocket })),
      load(options.vipExpiry, 'VIP', () => api.vip(room), vipDays => ({ vipDays })),
      load(options.monthCost, '月消费', async () => {
        const key = `guanyu:month-cost:v1:${uid}`;
        const raw = localStorage.getItem(key), saved = raw ? JSON.parse(raw) as MonthCost : null;
        if (saved?.uid === uid && saved.date === taskDay()) return saved;
        const value = await api.month(); if (current()) localStorage.setItem(key, JSON.stringify(value)); return value;
      }, month => ({ month })),
    ]);
    if (current()) { publish({ loading: false, error: errors.join('；') }); nextAt = optionSignature === JSON.stringify(settings.value.backpack) ? Date.now() + 60000 : 0; }
  }
  async function prepare(each = settings.value.backpack.glowCount) {
    if (stopped || state.value.sending || state.value.preparing) return;
    if (!settings.value.backpack.glow) { publish({ plan: null, glowError: '荧光棒续牌已关闭，请在背包设置中开启并保存' }); return; }
    const uid = accountId(), room = player.value.roomId, revision = generation;
    if (!uid || !room) { publish({ glowError: '请先登录并进入真实直播间' }); return; }
    publish({ preparing: true, glowError: '', sendError: '', plan: null, deliveries: {} });
    try {
      const gifts = await api.bag(room), rooms = await api.badges();
      if (stopped || revision !== generation || uid !== accountId()) return;
      const gift = gifts.find(gift => [268, 2358].includes(Number(gift.id)) && Number(gift.count) > 0);
      const profiles = await badgeRooms(rooms);
      if (stopped || revision !== generation || uid !== accountId()) return;
      publish({ gifts, badges: profiles.rooms, avatarError: profiles.avatarError, plan: { uid, gift: Number(gift?.id || 0), name: gift?.name || '荧光棒', available: Number(gift?.count || 0), each: 0, total: 0,
        rooms: profiles.rooms, avatarError: profiles.avatarError } });
      setGlowCount(each);
    } catch (cause) { if (revision === generation) publish({ glowError: cause instanceof Error ? cause.message : String(cause) }); }
    finally { if (revision === generation) publish({ preparing: false }); }
  }
  function setGlowCount(each: number) {
    const plan = state.value.plan;
    if (!plan || state.value.sending) return;
    if (!Number.isInteger(each) || each < 0 || each > 100000) { publish({ glowError: '每房数量应为 0～100000 的整数' }); return; }
    const count = each || (plan.rooms.length ? Math.floor(plan.available / plan.rooms.length) : 0), total = count * plan.rooms.length;
    const error = !plan.gift ? '背包中没有可赠送的荧光棒' : !plan.rooms.length ? '没有粉丝牌房间可供续牌'
      : count < 1 ? '荧光棒不足以向每个房间平均赠送 1 根' : total > plan.available ? `计划需 ${total} 根，当前只有 ${plan.available} 根` : '';
    publish({ plan: { ...plan, each: count, total }, glowError: error, sendError: '', deliveries: {} });
  }
  async function send() {
    const plan = state.value.plan, revision = generation;
    if (!plan || stopped || state.value.preparing || state.value.sending || state.value.glowError || plan.uid !== accountId() || !settings.value.backpack.glow) return;
    publish({ sending: true, sendError: '', deliveries: {} });
    try {
      const gifts = await api.bag(player.value.roomId || plan.rooms[0]!.id);
      if (Number(gifts.find(gift => Number(gift.id) === plan.gift)?.count || 0) < plan.total) throw new Error('荧光棒数量已变化，请重新生成计划');
      for (const room of plan.rooms) {
        if (stopped || revision !== generation || plan.uid !== accountId() || !settings.value.backpack.glow) break;
        publish({ deliveries: { ...state.value.deliveries, [room.id]: { status: 'sending' } } });
        try {
          await api.donate(plan.gift, plan.each, room.id);
          if (stopped || revision !== generation || plan.uid !== accountId()) return;
          publish({ deliveries: { ...state.value.deliveries, [room.id]: { status: 'sent' } }, sent: { ...state.value.sent, [room.id]: (state.value.sent[room.id] || 0) + plan.each } });
        } catch (cause) {
          if (revision === generation) publish({ deliveries: { ...state.value.deliveries, [room.id]: { status: 'failed', error: cause instanceof Error ? cause.message : String(cause) } } });
          throw cause;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } catch (cause) { if (revision === generation) publish({ sendError: `${cause instanceof Error ? cause.message : String(cause)}；已停止后续赠送，不自动重发` }); }
    finally { if (revision === generation) { publish({ sending: false }); void refresh(); } }
  }
  function sync() {
    const nextIdentity = `${accountId()}:${player.value.roomId || ''}`, nextOptions = JSON.stringify(settings.value.backpack);
    dom.apply(settings.value.backpack);
    if (identity === nextIdentity && lastOptions === nextOptions) return;
    const accountChanged = identity.split(':')[0] !== accountId();
    const roomChanged = identity !== nextIdentity;
    identity = nextIdentity; lastOptions = nextOptions; nextAt = 0;
    if (accountChanged) {
      generation++; api.close(); roomApi.close();
      publish({ loading: false, preparing: false, sending: false, plan: null, glowError: '', sendError: '', deliveries: {}, sent: {}, vipDays: null, pocket: [], gifts: [], badges: [], avatarError: '', month: null, error: '' });
    } else if (roomChanged) publish({ loading: false, vipDays: null, pocket: [], error: '' });
    void refresh();
  }
  const stopSettings = settings.subscribe(sync), stopPlayer = player.subscribe(sync);
  const timer = setInterval(() => { sync(); if (!document.hidden && Date.now() >= nextAt) void refresh(); }, 1000);
  return { ...state, get value() { return state.value; }, refresh, prepare, setGlowCount, send, openGlow,
    dispose() { stopped = true; generation++; clearInterval(timer); stopSettings(); stopPlayer(); api.close(); roomApi.close(); dom.dispose(); } };
}
export type BackpackController = ReturnType<typeof createBackpack>;
