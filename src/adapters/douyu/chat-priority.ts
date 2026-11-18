import type { PlayerStore } from './player';

export const chatRoomLock = (room: string) => `guanyu:chat-room:${room}`;
export const chatRoomChannel = 'guanyu:chat-room';

export function watchChatRoom(player: PlayerStore) {
  if (!navigator.locks) return () => {};
  const channel = new BroadcastChannel(chatRoomChannel);
  let room: string | null = null;
  let holding: AbortController | undefined;
  const stop = player.subscribe(({ roomId }) => {
    if (room === roomId) return;
    holding?.abort();
    room = roomId;
    if (!roomId) return;
    const { signal } = holding = new AbortController();
    // 观看页先排入共享锁，随后通知已经在准备同房连接的任务退出。
    void navigator.locks.request(chatRoomLock(roomId), { mode: 'shared', signal }, () => {
      if (signal.aborted) return;
      return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
    }).catch(error => {
      if (!signal.aborted) console.error('[观鱼] 注册正在观看的房间失败', error);
    });
    channel.postMessage(roomId);
  });
  return () => { stop(); holding?.abort(); channel.close(); };
}
