import type { DouyuTasks, TaskRoom } from '../../adapters/douyu/tasks';
import type { ChatSessions } from '../../adapters/douyu/chat-session';
import { taskDelay } from '../../adapters/douyu/task-request';
import type { SignRow } from './daily';

interface RoomProgress extends SignRow {
  targets?: TaskRoom[]; results?: Record<string, string>;
  submitted?: Record<string, boolean>;
  failures?: Record<string, { attempts: number; nextAt: number; error: string }>;
}

export async function runFanChat(lane: RoomProgress, api: DouyuTasks, sessions: ChatSessions, uid: string,
  current: () => void, changed: () => void) {
  if (!lane.targets) { lane.targets = await api.badges(); current(); lane.results ||= {}; changed(); }
  lane.failures ||= {}; lane.submitted ||= {};
  const results = lane.results!, failures = lane.failures, submitted = lane.submitted;
  const targets = lane.targets.filter(room => !results[room.id] && (failures[room.id]?.nextAt || 0) <= Date.now()).slice(0, 2);
  const failure = (room: TaskRoom, cause: any) => {
    if (cause.interrupted) throw cause;
    current(); const attempts = (failures[room.id]?.attempts || 0) + 1;
    failures[room.id] = { attempts, nextAt: Date.now() + taskDelay(attempts), error: cause.message || String(cause) };
    changed();
  };
  const ready: TaskRoom[] = [];
  // 每次尝试和跨页接手都先查官方进度，覆盖发送后尚未落盘就关闭页面的情况。
  await Promise.all(targets.map(async room => {
    try {
      const task = await api.fanChatTask(room.id); current();
      if (!task || task.done) { results[room.id] = !task ? 'no-task' : submitted[room.id] ? 'sent' : 'already'; delete failures[room.id]; changed(); }
      else if (submitted[room.id]) throw new Error('官方已接收弹幕，等待每日任务进度确认');
      else ready.push(room);
    } catch (cause) { failure(room, cause); }
  }));
  await Promise.all(ready.map(async room => {
    try {
      current(); await sessions.send(room.id, '.', uid, current); current();
      // 接收回包与任务完成分别保存，确认延迟或刷新后不再发送第二条。
      submitted[room.id] = true; changed();
      const after = await api.fanChatTask(room.id); current();
      if (!after?.done) throw new Error(`已发送弹幕，官方进度 ${after?.cur ?? '?'} / ${after?.max ?? '?'}，稍后先核对再处理`);
      results[room.id] = 'sent'; delete failures[room.id]; changed();
    } catch (cause) { failure(room, cause); }
  }));
  const pending = lane.targets.filter(room => !results[room.id]), count = lane.targets.length - pending.length;
  const failed = pending.find(room => failures[room.id]);
  lane.detail = `${count} / ${lane.targets.length} 个房间已处理；发送 ${Object.values(results).filter(value => value === 'sent').length} 个，已完成 ${Object.values(results).filter(value => value === 'already').length} 个，无任务 ${Object.values(results).filter(value => value === 'no-task').length} 个${failed ? `；${failed.name}：${failures[failed.id]!.error}` : ''}`;
  lane.status = !pending.length ? 'done' : pending.some(room => (failures[room.id]?.nextAt || 0) <= Date.now()) ? 'pending' : 'error';
  lane.nextAt = lane.status === 'error' ? Math.min(...pending.map(room => failures[room.id]!.nextAt)) : 0;
}
