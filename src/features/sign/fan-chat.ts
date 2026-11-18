import type { DouyuTasks, TaskRoom } from '../../adapters/douyu/tasks';
import type { ChatSessions } from '../../adapters/douyu/chat-session';
import { taskDelay } from '../../adapters/douyu/task-request';
import type { SignRow } from './daily';

interface RoomProgress extends SignRow {
  targets?: TaskRoom[]; results?: Record<string, string>;
  submitted?: Record<string, boolean>;
  deferred?: Record<string, number>;
  failures?: Record<string, { attempts: number; nextAt: number; error: string }>;
}

export async function runFanChat(lane: RoomProgress, api: DouyuTasks, sessions: ChatSessions, uid: string,
  current: () => void, changed: () => void) {
  if (!lane.targets) { lane.targets = await api.badges(); current(); lane.results ||= {}; changed(); }
  lane.failures ||= {}; lane.submitted ||= {}; lane.deferred ||= {};
  const results = lane.results!, failures = lane.failures, submitted = lane.submitted, deferred = lane.deferred;
  const nextCheck = (id: string) => Math.max(failures[id]?.nextAt || 0, deferred[id] || 0);
  const targets = lane.targets.filter(room => !results[room.id] && nextCheck(room.id) <= Date.now()).slice(0, 2);
  const failure = (room: TaskRoom, cause: any) => {
    if (cause.interrupted || cause.loginRequired) throw cause;
    current(); const attempts = (failures[room.id]?.attempts || 0) + 1;
    failures[room.id] = { attempts, nextAt: Date.now() + taskDelay(attempts), error: cause.message || String(cause) };
    changed();
  };
  const ready: TaskRoom[] = [];
  // 每次尝试和跨页接手都先查官方进度，覆盖发送后尚未落盘就关闭页面的情况。
  await Promise.all(targets.map(async room => {
    try {
      const task = await api.fanChatTask(room.id); current();
      if (!task || task.done) {
        results[room.id] = !task ? 'no-task' : submitted[room.id] ? 'sent' : 'already';
        delete failures[room.id]; delete deferred[room.id]; changed();
      }
      else if (submitted[room.id]) throw new Error('官方已接收弹幕，等待每日任务进度确认');
      else ready.push(room);
    } catch (cause) { failure(room, cause); }
  }));
  await Promise.all(ready.map(async room => {
    try {
      current(); const sent = await sessions.send(room.id, '.', uid, current); current();
      if (sent === false) {
        delete failures[room.id];
        deferred[room.id] = Date.now() + 60_000;
        changed();
        return;
      }
      // 接收回包与任务完成分别保存，确认延迟或刷新后不再发送第二条。
      submitted[room.id] = true; changed();
      const after = await api.fanChatTask(room.id); current();
      if (!after?.done) throw new Error(`已发送弹幕，官方进度 ${after?.cur ?? '?'} / ${after?.max ?? '?'}，稍后先核对再处理`);
      results[room.id] = 'sent'; delete failures[room.id]; delete deferred[room.id]; changed();
    } catch (cause) { failure(room, cause); }
  }));
  const pending = lane.targets.filter(room => !results[room.id]), count = lane.targets.length - pending.length;
  const failed = pending.find(room => failures[room.id]);
  const now = Date.now(), blocked = pending.filter(room => (deferred[room.id] || 0) > now).length;
  lane.detail = `${count} / ${lane.targets.length} 个房间已处理；发送 ${Object.values(results).filter(value => value === 'sent').length} 个，已完成 ${Object.values(results).filter(value => value === 'already').length} 个，无任务 ${Object.values(results).filter(value => value === 'no-task').length} 个${blocked ? `；${blocked} 个房间等待观看结束` : ''}${failed ? `；${failed.name}：${failures[failed.id]!.error}` : ''}`;
  lane.nextAt = pending.reduce((due, room) => Math.min(due, nextCheck(room.id)), Infinity);
  lane.status = !pending.length ? 'done' : lane.nextAt <= now ? 'pending' : failed ? 'error' : 'waiting';
  if (lane.status === 'done' || lane.status === 'pending') lane.nextAt = 0;
}
