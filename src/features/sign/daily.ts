import type { SettingsStore } from '../../config/settings';
import { signTasks, type SignTask } from '../../config/sign';
import { createState } from '../../core/state';
import { accountId, createTaskRequest, taskDay, taskDelay, interrupted, alreadySigned, type TaskRequest } from '../../adapters/douyu/task-request';
import { createDouyuTasks, type LevelTask, type TaskRoom } from '../../adapters/douyu/tasks';
import type { TaskRunner } from '../../adapters/douyu/task-runner';
import { checkPoints } from './points';
import { createChatSessions, rememberChatRuntime } from '../../adapters/douyu/chat-session';
import { runFanChat } from './fan-chat';
import { diagnostics } from '../../core/diagnostics';
import { createClientSignApi } from '../../adapters/douyu/client-sign';
import { runClientSign, clientSignDetail, type ClientProgress } from './client';

export interface SignRow { id: string; label: string; status: 'pending' | 'done' | 'waiting' | 'error' | 'disabled'; detail: string; nextAt: number; attempts: number }
interface Lane extends SignRow {
  targets?: TaskRoom[]; results?: Record<string, string>; signed?: boolean;
  submitted?: Record<string, boolean>;
  client?: ClientProgress;
  failures?: Record<string, { attempts: number; nextAt: number; error: string }>;
}
interface Progress { day: string; lanes: Record<string, Lane>; readIds: string[]; tasks: LevelTask[] }
interface Restore { id: string; name: string }
export interface DailySnapshot { uid: string; day: string; running: boolean; waiting: boolean; error: string; rows: SignRow[]; tasks: LevelTask[]; restore: string }

export function createDailyTasks(settings: SettingsStore, roomId: () => string, runner: TaskRunner) {
  let http = createTaskRequest();
  const chat = createChatSessions(roomId);
  const api = createDouyuTasks({ request: (...args: Parameters<TaskRequest['request']>) => http.request(...args), dispose: () => http.dispose() });
  const client = createClientSignApi({ request: (...args: Parameters<TaskRequest['request']>) => http.request(...args), dispose: () => http.dispose() }, current);
  const view = createState<DailySnapshot>({ uid: '', day: taskDay(), running: false, waiting: false, error: '', rows: [], tasks: [], restore: '' });
  let uid = '', state: Progress | undefined, restore: Restore | undefined, running = false, stopped = false, waiting = false, error = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous = JSON.stringify(settings.value.sign);
  let previousRemedy = settings.value.sign.clientRemedy;
  let active: string | undefined;
  const key = () => `guanyu:daily-tasks:v1:${uid}`;
  const restoreKey = () => `guanyu:follow-restore:v1:${uid}`;
  const taskRoom = () => roomId() || runner.room();
  function current() { if (stopped || accountId() !== uid || state?.day !== taskDay()) throw interrupted(); }
  function persist() { current(); localStorage.setItem(key(), JSON.stringify(state)); }
  function publish() {
    view.set({ uid, day: state?.day || taskDay(), running, waiting, error,
      rows: Object.values(state?.lanes || {}).map(row => ({ ...row, status: settings.value.sign.enabled && settings.value.sign[row.id as SignTask] ? row.status : 'disabled' })),
      tasks: [...state?.tasks || []], restore: restore ? `${restore.name}（${restore.id}）等待恢复未关注状态` : '' });
  }
  function summarizeFansHome(lane: Lane) {
    const targets = lane.targets!;
    const count = targets.filter(room => lane.results?.[room.id]).length;
    const pending = targets.filter(room => !lane.results?.[room.id]);
    const failed = pending.find(room => lane.failures?.[room.id]);
    lane.detail = `${count} / ${targets.length} 个房间已确认${pending.length ? '，继续按间隔处理' : ''}${failed ? `；${failed.name}：${lane.failures![failed.id]!.error}` : ''}`;
    lane.status = !pending.length ? 'done' : pending.some(room => (lane.failures?.[room.id]?.nextAt || 0) <= Date.now()) ? 'pending' : 'error';
    lane.nextAt = lane.status === 'error' ? Math.min(...pending.map(room => lane.failures![room.id]!.nextAt)) : 0;
    if (lane.status === 'done') lane.attempts = 0;
  }
  function restoreFansHome() {
    const lane = state?.lanes.fansHome;
    if (!lane?.targets || !lane.failures) return false;
    let changed = false;
    for (const room of lane.targets) {
      const failure = lane.failures[room.id];
      if (!failure || !alreadySigned(failure.error)) continue;
      lane.results ||= {};
      lane.results[room.id] ||= 'already';
      delete lane.failures[room.id];
      changed = true;
    }
    if (changed) summarizeFansHome(lane);
    return changed;
  }
  function load() {
    uid = accountId(); state = undefined; restore = undefined;
    if (!uid) return;
    const raw = localStorage.getItem(key()), saved = raw ? JSON.parse(raw) : undefined;
    state = saved?.day === taskDay() && saved.lanes && Array.isArray(saved.readIds) && Array.isArray(saved.tasks)
      ? saved : { day: taskDay(), lanes: {}, readIds: [], tasks: [] };
    const savedRestore = localStorage.getItem(restoreKey());
    if (savedRestore) {
      const item = JSON.parse(savedRestore);
      if (!/^\d+$/.test(item.id)) throw new Error('关注恢复记录格式异常');
      restore = item;
    }
    state!.lanes = Object.fromEntries(signTasks.filter(task => task.id !== 'yuba' && task.id !== 'starPacket').map(task => [task.id,
      state!.lanes[task.id] || { id: task.id, label: task.label, status: 'pending', detail: '等待按间隔处理', nextAt: 0, attempts: 0 }]));
    const clientLane = state!.lanes.client!;
    if (clientLane.status === 'done' && (clientLane.client?.remaining === undefined || settings.value.sign.clientRemedy && !clientLane.client.remedyChecked)) {
      clientLane.status = 'pending'; clientLane.nextAt = 0;
    }
    return restoreFansHome();
  }
  async function restoreFollow() {
    if (!restore) return;
    const target = restore;
    const followed = await api.followed(); current();
    if (followed.some(room => room.id === target.id)) await api.unfollow(target.id);
    current();
    if ((await api.followed()).some(room => room.id === target.id)) throw new Error(`取关尚未确认：${target.name}（${target.id}）`);
    current(); localStorage.removeItem(restoreKey()); restore = undefined;
  }
  async function temporaryFollow(target: TaskRoom) {
    const follows = await api.followed(); current();
    if (follows.some(room => room.id === target.id)) return false;
    // 先记录原本未关注，再发送请求；刷新或中断后优先恢复，不动原有关注。
    restore = { id: target.id, name: target.name };
    localStorage.setItem(restoreKey(), JSON.stringify(restore)); publish();
    try { await api.follow(target.id); current(); }
    finally { if (!stopped && accountId() === uid) await restoreFollow(); }
    return true;
  }
  async function fansHomeLane(lane: Lane) {
    if (!lane.targets) {
      lane.targets = await api.badges();
      current(); lane.results ||= {}; persist();
    }
    lane.failures ||= {};
    const target = lane.targets.find(room => !lane.results?.[room.id] && (lane.failures?.[room.id]?.nextAt || 0) <= Date.now());
    if (target) {
      try {
        const result = await api.signFansHome(target.id);
        current(); lane.results![target.id] = result; delete lane.failures[target.id]; persist();
      } catch (cause: any) {
        if (cause.interrupted) throw cause;
        current(); const attempts = (lane.failures[target.id]?.attempts || 0) + 1;
        lane.failures[target.id] = { attempts, nextAt: Date.now() + taskDelay(attempts), error: cause.message || String(cause) };
        persist();
      }
    }
    summarizeFansHome(lane);
  }
  async function readLane(lane: Lane) {
    const rid = taskRoom(); if (!rid) throw new Error('等待识别真实房间号');
    const tasks = await api.level(rid); current(); state!.tasks = tasks;
    const task = tasks.find(task => task.taskType === 10);
    if (!task || Number(task.taskStatus) === 1 || Number(task.cur) >= Number(task.max)) {
      lane.status = 'done'; lane.detail = task ? `官方已确认 ${task.cur} / ${task.max} 条` : '官方当前没有阅读任务'; return;
    }
    const remaining = Math.max(0, Number(task.max) - Number(task.cur));
    if (state!.readIds.length < Number(task.max)) {
      const feeds = (await api.posts()).filter(feed => !state!.readIds.includes(feed.id));
      current();
      for (let index = feeds.length - 1; index > 0; index--) { const other = Math.floor(Math.random() * (index + 1)); [feeds[index], feeds[other]] = [feeds[other], feeds[index]]; }
      for (const feed of feeds.slice(0, Math.min(remaining, Number(task.max) - state!.readIds.length))) {
        await api.readPost(feed); current(); state!.readIds.push(feed.id); persist();
      }
    }
    const after = await api.level(rid); current(); state!.tasks = after;
    const checked = after.find(item => item.taskId === task.taskId);
    lane.status = checked?.taskStatus === 1 ? 'done' : 'waiting';
    lane.detail = checked?.taskStatus === 1 ? `官方已确认 ${checked.cur} / ${checked.max} 条`
      : `已读取 ${state!.readIds.length} 个不同真实帖子，官方计数 ${checked?.cur ?? task.cur} / ${task.max}，等待确认`;
    lane.nextAt = Date.now() + 60000;
  }
  async function followLane(lane: Lane) {
    const rid = taskRoom(); if (!rid) throw new Error('等待识别真实房间号');
    const tasks = await api.level(rid); current(); state!.tasks = tasks;
    const task = tasks.find(task => task.taskType === 7);
    if (!task || task.taskStatus === 1) { lane.status = 'done'; lane.detail = task ? '官方已确认关注任务完成' : '官方当前没有关注任务'; return; }
    const follows = new Set((await api.followed()).map(room => room.id));
    const targets = await api.starRooms(rid); current();
    const target = targets.find(room => !follows.has(room.id));
    if (!target) throw new Error('没有找到适合临时关注的未关注房间');
    await temporaryFollow(target); current();
    const after = await api.level(rid); current(); state!.tasks = after;
    if (after.find(item => item.taskId === task.taskId)?.taskStatus !== 1) throw new Error('关注关系已恢复，官方尚未确认关注任务完成');
    lane.status = 'done'; lane.detail = `官方任务完成；${target.name} 已恢复未关注`;
  }
  async function execute(lane: Lane) {
    switch (lane.id) {
      case 'client': {
        await runClientSign(client, state!.day, () => settings.value.sign.clientRemedy, current, progress => {
          current(); lane.client = progress; lane.detail = clientSignDetail(progress); persist(); publish();
        });
        lane.status = 'done'; break;
      }
      case 'fansHome': await fansHomeLane(lane); break;
      case 'fanChat': await runFanChat(lane, api, chat, uid, current, () => { persist(); publish(); }); break;
      case 'readPosts': await readLane(lane); break;
      case 'follow': await followLane(lane); break;
      case 'points': {
        const result = await checkPoints(api, current);
        lane.signed = result.signed; lane.detail = result.detail; persist();
        if (result.failed) throw new Error(result.detail);
        lane.status = 'waiting'; lane.nextAt = Date.now() + 300000;
        lane.detail += '，每 5 分钟检查'; break;
      }
      case 'level': {
        const rid = taskRoom(); if (!rid) throw new Error('等待识别真实房间号');
        let tasks = await api.level(rid); current();
        const claimable = tasks.filter(task => task.taskStatus === 1 && task.prizeStatus === 0);
        for (const task of claimable) { await api.levelPrize(rid, task.taskId); current(); }
        if (claimable.length) {
          tasks = await api.level(rid);
          if (claimable.some(task => tasks.find(item => item.taskId === task.taskId)?.prizeStatus !== 1)) throw new Error('部分等级任务奖励尚未获官方确认');
        }
        state!.tasks = tasks; lane.status = 'waiting'; lane.nextAt = Date.now() + 35000;
        lane.detail = `${claimable.length ? `本轮已领取 ${claimable.length} 项` : '暂无可领取等级奖励'}，每 35 秒检查`; break;
      }
      case 'star': {
        const rid = taskRoom(); if (!rid) throw new Error('等待识别真实房间号');
        const config = await api.starConfig(); current();
        if (!config) { lane.status = 'done'; lane.detail = '官方星推当前未开放'; break; }
        if (!lane.targets) { lane.targets = await api.starRooms(rid); lane.results ||= {}; current(); persist(); }
        const task = config.userTaskConfig.userTasks.find((task: any) => Number(task.taskType) === 5);
        const count = Math.min(Number(task?.circulation) || 0, lane.targets!.length);
        for (const room of lane.targets!.slice(0, count)) {
          if (lane.results![`sign:${room.id}`]) continue;
          await api.starSign(room.id); current(); lane.results![`sign:${room.id}`] = 'done'; persist();
        }
        if (settings.value.sign.follow) {
          const task = config.userTaskConfig.userTasks.find((task: any) => Number(task.taskType) === 4);
          const count = Number(task?.circulation) || 0;
          const followed = new Set((await api.followed()).map(room => room.id)); current();
          for (const room of lane.targets!.filter(room => !followed.has(room.id))) {
            if (Object.entries(lane.results!).filter(([key, result]) => key.startsWith('follow:') && result === 'done').length >= count) break;
            if (lane.results![`follow:${room.id}`]) continue;
            const changed = await temporaryFollow(room); current();
            lane.results![`follow:${room.id}`] = changed ? 'done' : '保留既有关注'; persist();
          }
        }
        lane.status = 'done'; lane.detail = `${config.baseConfig.actName}：${count} 个房间签到上报已确认，临时关注均已恢复`; break;
      }
    }
  }
  async function wake(manual = false) {
    if (stopped || running) return;
    running = true; waiting = false; clearTimeout(timer);
    try {
      load(); error = ''; publish();
      if (!uid) { await runner.claim(''); return; }
      if (!navigator.locks) throw new Error('自动签到需要 HTTPS 和支持 Web Locks 的新版浏览器');
      if (!await runner.claim(uid, roomId())) { waiting = true; return; }
      rememberChatRuntime();
      await navigator.locks.request(`guanyu:daily-tasks:${uid}`, { ifAvailable: true }, async lock => {
        if (!lock) { waiting = true; return; }
        current();
        const restored = load(); current();
        if (restored) persist();
        if (restore) await restoreFollow();
        if (!settings.value.sign.enabled || navigator.onLine === false) return;
        if (runner.take('daily')) manual = true;
        if (manual) for (const lane of Object.values(state!.lanes)) {
          if (lane.status !== 'done') lane.nextAt = 0;
          if (lane.id === 'fansHome') { lane.targets = undefined; lane.status = 'pending'; lane.nextAt = 0; }
          if (lane.id === 'client') { lane.status = 'pending'; lane.nextAt = 0; }
        }
        const lane = Object.values(state!.lanes).filter(lane => settings.value.sign[lane.id as SignTask] && lane.status !== 'done' && lane.nextAt <= Date.now())
          .sort((a, b) => a.nextAt - b.nextAt)[0];
        if (!lane) return;
        active = lane.id;
        lane.attempts++; lane.nextAt = Date.now() + 120000; persist(); publish();
        try {
          await execute(lane); current(); lane.attempts = 0;
          if (lane.status === 'pending') lane.nextAt = 0;
        } catch (cause: any) {
          if (cause.interrupted) throw cause;
          current(); lane.status = 'error'; lane.detail = cause.message || String(cause); lane.nextAt = Date.now() + taskDelay(lane.attempts);
          if (lane.id === 'client' && lane.client) lane.detail = `${clientSignDetail(lane.client)}；${lane.detail}`;
          diagnostics.report(`sign.${lane.id}`, 'error', lane.detail, '任务');
        }
        persist();
      });
    } catch (cause: any) { if (!cause.interrupted) error = cause.message || String(cause); }
    finally { running = false; active = undefined; if (!stopped) { publish(); schedule(); } }
  }
  function schedule() {
    let delay = 30000;
    if (!waiting && !error && state && settings.value.sign.enabled && navigator.onLine !== false) {
      const due = Object.values(state.lanes).filter(lane => settings.value.sign[lane.id as SignTask] && lane.status !== 'done').map(lane => lane.nextAt);
      if (due.length) delay = Math.max(500, Math.min(delay, Math.min(...due) - Date.now()));
    }
    timer = setTimeout(() => { void wake(); }, delay);
  }
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === key() || event.key === restoreKey() || runner.matches(event.key)) void wake(); };
  const onVisible = () => { if (!document.hidden) void wake(); };
  const onOnline = () => { void wake(); };
  const stopSettings = settings.subscribe(value => {
    const next = JSON.stringify(value.sign);
    if (next === previous) return;
    previous = next;
    const remedyStopped = previousRemedy && !value.sign.clientRemedy;
    previousRemedy = value.sign.clientRemedy;
    if (active && (!value.sign.enabled || !value.sign[active as SignTask] || active === 'client' && remedyStopped)) {
      chat.cancel();
      http.dispose(); http = createTaskRequest();
    }
    void wake();
  });
  window.addEventListener('storage', onStorage); window.addEventListener('online', onOnline); document.addEventListener('visibilitychange', onVisible);
  void wake();
  return { ...view, get value() { return view.value; }, run: () => wake(true),
    dispose() { stopped = true; clearTimeout(timer); http.dispose(); chat.dispose(); stopSettings(); window.removeEventListener('storage', onStorage); window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); },
  };
}
export type DailyTasks = ReturnType<typeof createDailyTasks>;
