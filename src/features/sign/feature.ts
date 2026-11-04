import { GM_openInTab } from '$';
import type { SettingsStore } from '../../config/settings';
import { createTaskRequest, taskDay } from '../../adapters/douyu/task-request';
import { createState } from '../../core/state';
import { createDailyTasks, type SignRow } from './daily';
import { SignYubaController } from './yuba';
import type { LevelTask } from '../../adapters/douyu/tasks';
import { observeStarPacket } from '../../adapters/douyu/star-packet';

export interface SignSnapshot {
  uid: string; day: string; rows: SignRow[]; tasks: LevelTask[]; yubaDetails: string[];
  running: boolean; error: string; notice: string; restore: string;
  packet: { available: boolean; visible: boolean; status: string };
}
export function createSign(settings: SettingsStore, roomId: () => string,
  reminder: (title: string, content: string) => Promise<boolean>) {
  const packet = observeStarPacket();
  const state = createState<SignSnapshot>({ uid: '', day: taskDay(), rows: [], tasks: [], yubaDetails: [], running: false, error: '', notice: '', restore: '', packet: packet.value });
  let yuba: SignYubaController | undefined, stopped = false, notice = '';
  let yubaRow: SignRow = { id: 'yuba', label: '鱼吧签到', status: 'pending', detail: '等待登录后读取', nextAt: 0, attempts: 0 };
  let yubaDetails: string[] = [];
  const daily = createDailyTasks(settings, roomId);
  function publish() {
    if (stopped) return;
    const value = daily.value;
    state.set({ uid: value.uid, day: value.day, rows: [{ ...yubaRow }, ...value.rows], tasks: value.tasks,
      yubaDetails: [...yubaDetails], running: value.running || !!yuba?.running, error: value.error, notice, restore: value.restore, packet: packet.value });
  }
  function report(controller: SignYubaController, message: string) {
    const progress = controller.state, groups = Object.values(progress?.groups || {}) as any[];
    const pending = groups.filter(group => group.status === 'pending');
    yubaRow = { id: 'yuba', label: '鱼吧签到', status: progress?.list.done && !pending.length ? 'done' : 'waiting',
      detail: message, nextAt: Math.min(...pending.map(group => Math.max(group.nextAt || 0, progress?.requestAt || 0)), Infinity), attempts: 0 };
    yubaDetails = [];
    if (progress?.list.error) yubaDetails.push(`关注名单第 ${progress.list.page} 页：${progress.list.error}`);
    for (const group of groups) {
      if (group.status === 'pending') yubaDetails.push(`${group.name}（${group.id}）：${group.error || '等待签到'}；已尝试 ${group.attempts} 次`);
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
        });
      yuba.start();
    } else if (!enabled && yuba) { yuba.dispose(); yuba = undefined; }
    if (!enabled) yubaRow = { ...yubaRow, status: 'disabled', detail: '已关闭自动鱼吧签到' };
    else if (yuba) void yuba.wake();
    publish();
  });
  return { ...state, get value() { return state.value; },
    openPacket: packet.open,
    async run() { notice = '正在检查今日进度，任务将按账号共享间隔处理'; publish(); await Promise.all([daily.run(), yuba?.wake(true)]); },
    dispose() { stopped = true; stopSettings(); stopDaily(); stopPacket(); packet.dispose(); yuba?.dispose(); daily.dispose(); },
  };
}
export type SignController = ReturnType<typeof createSign>;
