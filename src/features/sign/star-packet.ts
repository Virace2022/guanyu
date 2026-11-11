import type { SettingsStore } from '../../config/settings';
import { createState } from '../../core/state';
import { diagnostics } from '../../core/diagnostics';
import { createStarPacketApi, type StarPacket, type PacketClaim } from '../../adapters/douyu/star-packet';
import { accountId, accountReady, interrupted, taskDay } from '../../adapters/douyu/task-request';

interface RecordEntry { status: PacketClaim['status'] | 'sending'; detail: string; nextAt: number; attempts: number }
interface Progress {
  day: string; nextPollAt: number; checked: boolean;
  bags: { id: string; readyAt: number }[]; records: Record<string, RecordEntry>;
}
export interface StarPacketSnapshot { status: string; error: string; running: boolean; received: number }
const pollInterval = 60000, leadTime = 2000, graceTime = 2000, sendInterval = 250;

export function createStarPacket(settings: SettingsStore, roomId: () => string) {
  const view = createState<StarPacketSnapshot>({ status: '等待识别当前直播间', error: '', running: false, received: 0 });
  let abort = new AbortController(), generation = 0, identity = '', stopped = false, running = false, wakeAt = 0, error = '';
  let alarm: ReturnType<typeof setTimeout> | undefined;
  let progress: Progress | undefined;
  let packets = new Map<string, StarPacket>();
  const enabled = () => settings.value.sign.enabled && settings.value.sign.starPacket;
  const key = () => `guanyu:star-packet:v1:${accountId()}:${roomId()}`;
  function read(): Progress {
    const raw = localStorage.getItem(key());
    if (!raw) return { day: taskDay(), nextPollAt: 0, checked: false, bags: [], records: {} };
    const value = JSON.parse(raw);
    if (value.day !== taskDay()) return { day: taskDay(), nextPollAt: 0, checked: false, bags: [], records: {} };
    if (!Array.isArray(value.bags) || !value.records || typeof value.records !== 'object' || !Number.isFinite(value.nextPollAt)) throw new Error('星推荐红包进度格式异常');
    return value;
  }
  const pending = (value: Progress) => value.bags.filter(bag => !['received', 'exhausted', 'failed'].includes(value.records[bag.id]?.status || ''));
  function due(value: Progress, bag: Progress['bags'][number]) { return Math.max(bag.readyAt - leadTime, value.records[bag.id]?.nextAt || 0); }
  function schedule() {
    if (alarm !== undefined) clearTimeout(alarm);
    alarm = undefined;
    if (!stopped && !running && enabled() && accountReady() && /^\d+$/.test(roomId())) {
      alarm = setTimeout(() => { alarm = undefined; void wake(); }, Math.max(0, wakeAt - Date.now()));
    }
  }
  function publish() {
    const received = Object.values(progress?.records || {}).filter(record => record.status === 'received').length;
    let status: string;
    if (!enabled()) status = '星推荐红包自动领取已关闭';
    else if (!accountId()) status = '登录斗鱼后自动领取星推荐红包';
    else if (!accountReady()) status = '等待斗鱼登录就绪，暂不检查星推荐红包';
    else if (!roomId()) status = '进入直播间后自动检查星推荐红包';
    else if (running) status = '正在检查或领取当前房间的星推荐红包…';
    else {
      const bags = progress ? pending(progress) : [];
      if (bags.length) {
        const seconds = Math.max(0, Math.ceil((Math.min(...bags.map(bag => due(progress!, bag))) - Date.now()) / 1000));
        status = seconds ? `发现 ${bags.length} 个红包，${seconds} 秒后开始抢领` : '即将抢领星推荐红包';
      } else {
        const last = Object.values(progress?.records || {}).at(-1)?.detail;
        status = progress?.checked ? last ? `${last}；每分钟检查新红包` : '当前暂无待领红包，每分钟检查一次' : '等待检查当前房间的星推荐红包';
      }
      if (received) status += `；今日已领取 ${received} 个`;
    }
    view.set({ status, error, running, received });
  }
  async function claimBurst(api: ReturnType<typeof createStarPacketApi>, room: string, packet: StarPacket, current: () => void) {
    const stop = new AbortController(), lifetime = abort.signal;
    const deadline = packet.readyAt + graceTime;
    let result: PacketClaim = { status: 'failed', detail: '本轮抢领已结束，未收到成功确认' }, attempts = 0;
    let pulse: ReturnType<typeof setTimeout> | undefined;
    const inFlight = new Set<Promise<void>>();
    const cancel = () => stop.abort();
    lifetime.addEventListener('abort', cancel, { once: true });
    if (lifetime.aborted) cancel();
    await new Promise<void>(resolve => {
      const finish = () => { if (pulse !== undefined) clearTimeout(pulse); stop.abort(); resolve(); };
      const end = setTimeout(finish, Math.max(0, deadline - Date.now()));
      stop.signal.addEventListener('abort', () => { clearTimeout(end); if (pulse !== undefined) clearTimeout(pulse); resolve(); }, { once: true });
      const send = () => {
        try { current(); } catch { finish(); return; }
        if (stop.signal.aborted || Date.now() >= deadline) { finish(); return; }
        if (inFlight.size < 2) {
          attempts++;
          const request = api.claim(room, packet, stop.signal).then(value => {
            // 已收到的成功优先于竞争请求的终止状态；取消请求本身不构成失败结果。
            if (value.status === 'received' || !stop.signal.aborted && value.status !== 'retry') { result = value; finish(); }
          }).catch(cause => {
            if (!stop.signal.aborted) {
              result = { status: 'failed', detail: `本轮抢领未确认成功：${cause.message || String(cause)}` };
              if (cause.terminal) finish();
            }
          }).finally(() => inFlight.delete(request));
          inFlight.add(request);
        }
        if (!stop.signal.aborted) pulse = setTimeout(send, sendInterval);
      };
      if (stop.signal.aborted) { clearTimeout(end); resolve(); } else send();
    });
    await Promise.allSettled(inFlight);
    lifetime.removeEventListener('abort', cancel);
    current();
    return { ...result, attempts, nextAt: 0 };
  }
  async function wake(manual = false) {
    if (stopped || running || !enabled() || !accountReady() || !/^\d+$/.test(roomId())) return;
    const expected = generation, uid = accountId(), room = roomId(), day = taskDay();
    const current = () => {
      if (stopped || generation !== expected || uid !== accountId() || room !== roomId() || day !== taskDay() || !enabled()) throw interrupted();
    };
    const save = () => { current(); localStorage.setItem(key(), JSON.stringify(progress)); };
    running = true; publish();
    try {
      if (!navigator.locks) throw new Error('自动领取红包需要支持 Web Locks 的新版浏览器');
      const api = createStarPacketApi(abort.signal, current);
      await navigator.locks.request(`guanyu:star-packet:${uid}:${room}`, { ifAvailable: true }, async lock => {
        current();
        if (!lock) { wakeAt = Date.now() + 1500; return; }
        const value = read(); progress = value;
        let expired = false;
        for (const record of Object.values(value.records)) {
          if (record.status === 'sending' && record.nextAt <= Date.now()) {
            record.status = 'failed'; record.detail = '上轮抢领已结束，未收到成功确认'; record.nextAt = 0;
            expired = true;
          }
        }
        if (expired) save();
        const refresh = async () => {
          const list = await api.list(room); current();
          packets = new Map(list.map(packet => [packet.id, packet]));
          value.bags = list.filter(packet => packet.status === 0).map(({ id, readyAt }) => ({ id, readyAt }));
          for (const packet of list) {
            const status = packet.status === 4 ? 'received' : packet.status === 3 ? 'exhausted' : packet.status === 10 ? 'failed' : undefined;
            if (status && value.records[packet.id]?.status !== 'received') value.records[packet.id] = { status, detail: status === 'received' ? '官方显示红包已领取' : status === 'exhausted' ? '星推荐红包已被抢完' : '星推荐红包已过期', attempts: 0, nextAt: 0 };
          }
          value.checked = true; value.nextPollAt = Date.now() + pollInterval; save();
          error = '';
          diagnostics.report('sign.starPacket', 'waiting', pending(value).length ? `发现 ${pending(value).length} 个红包，预计开抢前两秒开始抢领` : '当前房间暂无待领红包，一分钟后检查', '红包');
        };
        const next = pending(value).sort((a, b) => due(value, a) - due(value, b))[0];
        const missing = next && !packets.has(next.id);
        // 已知红包临近开抢时优先领取，不能让列表查询占住最后几秒。
        if (missing || !next && (manual || Date.now() >= value.nextPollAt)
          || next && due(value, next) - Date.now() > 12000 && (manual || Date.now() >= value.nextPollAt)) await refresh();
        if (pending(value).length) await api.prepare();
        const bag = pending(value).find(bag => due(value, bag) <= Date.now());
        const packet = bag && packets.get(bag.id);
        if (bag && packet) {
          value.records[bag.id] = { status: 'sending', detail: '正在抢领星推荐红包', nextAt: bag.readyAt + graceTime, attempts: 0 }; save();
          const result = await claimBurst(api, room, { ...packet, readyAt: bag.readyAt }, current);
          value.records[bag.id] = result;
          error = result.status === 'failed' ? result.detail : '';
          diagnostics.report('sign.starPacket', result.status === 'received' ? 'applied' : result.status === 'exhausted' ? 'idle' : 'error', result.detail, '红包');
          save();
          await refresh();
          error = result.status === 'failed' ? result.detail : '';
        }
        const times = pending(value).map(bag => due(value, bag));
        wakeAt = times.length && Math.min(...times) - Date.now() <= 12000 ? Math.min(...times) : Math.min(value.nextPollAt, ...times);
      });
    } catch (cause: any) {
      if (generation === expected && !cause.interrupted) {
        error = cause.message || String(cause); wakeAt = Date.now() + pollInterval;
        diagnostics.report('sign.starPacket', 'error', error, '红包');
      }
    } finally { if (generation === expected) { running = false; publish(); schedule(); } }
  }
  function sync() {
    const next = `${enabled()}:${accountId()}:${roomId()}:${taskDay()}`;
    if (identity !== next) {
      identity = next; generation++; abort.abort(); abort = new AbortController();
      packets.clear(); progress = undefined; error = ''; wakeAt = 0; running = false;
      schedule();
    }
    publish();
    if (Date.now() >= wakeAt && !running) void wake();
  }
  const stopSettings = settings.subscribe(sync);
  const timer = setInterval(sync, 1000);
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === key()) { wakeAt = 0; void wake(); } };
  const onOnline = () => { wakeAt = 0; void wake(); };
  window.addEventListener('storage', onStorage); window.addEventListener('online', onOnline);
  return { ...view, get value() { return view.value; }, run: () => wake(true),
    dispose() { stopped = true; generation++; clearInterval(timer); if (alarm !== undefined) clearTimeout(alarm); stopSettings(); abort.abort(); window.removeEventListener('storage', onStorage); window.removeEventListener('online', onOnline); },
  };
}
