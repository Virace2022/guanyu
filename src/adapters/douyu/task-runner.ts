import { taskDay } from './task-request';

export function createTaskRunner(storage: Storage = localStorage) {
  let uid = '', owner = false, stopped = false;
  let release: (() => void) | undefined;
  let pending: Promise<boolean> | undefined;
  const key = (kind: string) => `guanyu:task-retry:v1:${uid}:${kind}`;

  async function claim(account: string, roomId = ''): Promise<boolean> {
    if (stopped) return false;
    if (account !== uid) {
      release?.(); release = undefined; pending = undefined; owner = false; uid = account;
    }
    if (!account) return false;
    if (!navigator.locks) throw new Error('自动签到需要 HTTPS 和支持 Web Locks 的新版浏览器');
    if (roomId) storage.setItem(`guanyu:task-room:v1:${account}`, roomId);
    if (owner) return true;
    if (pending) return pending;
    const attempt = new Promise<boolean>((resolve, reject) => {
      void navigator.locks.request(`guanyu:task-runner:${account}`, { ifAvailable: true }, async lock => {
        if (!lock || stopped || uid !== account) { resolve(false); return; }
        owner = true;
        // 整个账号由同一页调度；页面释放或关闭后，其他页面重新读取进度接手。
        const held = new Promise<void>(done => { release = done; });
        resolve(true);
        await held;
      }).catch(reject);
    });
    pending = attempt;
    try { return await attempt; }
    finally { if (pending === attempt) pending = undefined; }
  }

  return {
    claim,
    room() { return uid ? storage.getItem(`guanyu:task-room:v1:${uid}`) || '' : ''; },
    submit(account: string) {
      for (const kind of ['daily', 'yuba']) storage.setItem(`guanyu:task-retry:v1:${account}:${kind}`, taskDay());
    },
    take(kind: string) {
      if (!owner) return false;
      const value = storage.getItem(key(kind));
      if (value !== null) storage.removeItem(key(kind));
      return value === taskDay();
    },
    matches(eventKey: string | null) { return eventKey === null || eventKey.startsWith(`guanyu:task-retry:v1:${uid}:`); },
    dispose() { stopped = true; owner = false; release?.(); release = undefined; },
  };
}

export type TaskRunner = ReturnType<typeof createTaskRunner>;
