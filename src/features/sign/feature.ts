import { GM_openInTab } from '$';
import type { SettingsStore } from '../../config/settings';
import { accountId, createTaskRequest, taskDay } from '../../adapters/douyu/task-request';
import { createState } from '../../core/state';
import { createDailyTasks, type SignRow } from './daily';
import { SignYubaController } from './yuba';
import type { LevelTask } from '../../adapters/douyu/tasks';
import { createStarPacket, type StarPacketSnapshot } from './star-packet';
import { createTaskRunner } from '../../adapters/douyu/task-runner';
import { diagnostics } from '../../core/diagnostics';

export interface SignSnapshot {
  uid: string; day: string; rows: SignRow[]; tasks: LevelTask[]; yubaDetails: string[];
  running: boolean; error: string; notice: string; restore: string;
  packet: StarPacketSnapshot;
}
export function createSign(settings: SettingsStore, roomId: () => string,
  reminder: (title: string, content: string) => Promise<boolean>) {
  const packet = createStarPacket(settings, roomId);
  const state = createState<SignSnapshot>({ uid: '', day: taskDay(), rows: [], tasks: [], yubaDetails: [], running: false, error: '', notice: '', restore: '', packet: packet.value });
  let yuba: SignYubaController | undefined, stopped = false, notice = '';
  let yubaRow: SignRow = { id: 'yuba', label: '鱼吧签到', status: 'pending', detail: '等待登录后读取', nextAt: 0, attempts: 0 };
  let yubaDetails: string[] = [];
  const runner = createTaskRunner();
  const daily = createDailyTasks(settings, roomId, runner);
  function publish() {
    if (stopped) return;
    const value = daily.value;
    state.set({ uid: value.uid, day: value.day, rows: [{ ...yubaRow }, ...value.rows], tasks: value.tasks,
      yubaDetails: [...yubaDetails], running: value.running || !!yuba?.running || packet.value.running, error: value.error, notice, restore: value.restore, packet: packet.value });
  }
  function report(controller: SignYubaController, message: string) {
    const progress = controller.state, groups = Object.values(progress?.groups || {}) as any[];
    const pending = groups.filter(group => group.status === 'pending');
    if (progress?.list.error) diagnostics.report('sign.yuba', 'error', progress.list.error, '关注名单');
    for (const group of groups) if (group.error || group.supplementError) diagnostics.report('sign.yuba', 'error', group.error || group.supplementError, `鱼吧 ${group.id}`);
    yubaRow = { id: 'yuba', label: '鱼吧签到', status: progress?.list.done && !pending.length ? 'done' : 'waiting',
      detail: message, nextAt: Math.min(...pending.map(group => Math.max(group.nextAt || 0, progress?.requestAt || 0)), Infinity), attempts: 0 };
    yubaDetails = [];
    if (progress?.list.error) yubaDetails.push(`关注名单第 ${progress.list.page} 页：${progress.list.error}；已尝试 ${progress.list.attempts} 次`);
    for (const group of groups) {
      if (group.status === 'pending') {
        const nextAt = Math.max(group.nextAt || 0, progress?.requestAt || 0);
        const next = nextAt > Date.now() ? `最早 ${new Date(nextAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} 再尝试` : '等待按间隔处理';
        yubaDetails.push(`${group.name}（${group.id}）：${group.error || '等待签到'}；已尝试 ${group.attempts} 次；${next}`);
      }
      if (group.supplementError) yubaDetails.push(`${group.name}：今日签到已确认；补签失败：${group.supplementError}`);
      else if (group.status !== 'pending' && !group.supplemented) yubaDetails.push(`${group.name}：今日签到已确认；等待补签`);
    }
    publish();
  }
  const stopDaily = daily.subscribe(publish);
  const stopPacket = packet.subscribe(publish);
  const stopSettings = settings.subscribe(value => {
    const enabled = value.sign.enabled && value.sign.yuba;
    if (enabled && !yuba) {
      yuba = new SignYubaController(settings, createTaskRequest(), report,
        (message: string) => { notice = message; publish(); },
        async ({ title, content }: { title: string; content: string }) => {
          if (await reminder(title, content)) GM_openInTab('https://yuba.douyu.com/', { active: true });
        }, runner);
      yuba.start();
    } else if (!enabled && yuba) { yuba.dispose(); yuba = undefined; }
    if (!enabled) yubaRow = { ...yubaRow, status: 'disabled', detail: '已关闭自动鱼吧签到' };
    else if (yuba) void yuba.wake();
    publish();
  });
  return { ...state, get value() { return state.value; },
    async run() {
      const uid = accountId();
      try {
        if (!uid) { notice = '请先登录斗鱼'; publish(); return; }
        if (!settings.value.sign.enabled) { notice = '签到已关闭，请开启并保存后再检查'; publish(); return; }
        runner.submit(uid);
        notice = '已提交检查请求，未完成任务将由当前调度页面处理'; publish();
        await Promise.all([daily.run(), yuba?.wake(true), packet.run()]);
      } catch (cause) { notice = `检查请求提交失败：${String(cause)}`; publish(); }
    },
    dispose() { stopped = true; stopSettings(); stopDaily(); stopPacket(); packet.dispose(); yuba?.dispose(); daily.dispose(); runner.dispose(); },
  };
}
export type SignController = ReturnType<typeof createSign>;
