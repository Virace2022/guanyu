import { unsafeWindow } from '$';

interface PlayerAction { id: string; action: string; data?: unknown[] }
let cached: { queue: any; runtime: any } | undefined;

function runtime() {
  const queue = (unsafeWindow as any).sharkLivePlayerJsonp;
  if (!Array.isArray(queue) || queue.push === Array.prototype.push) return;
  if (cached?.queue === queue) return cached.runtime;
  let found: any;
  const id = `guanyu-player-${Date.now()}`;
  queue.push([[id], { [id]: (_module: any, _exports: any, require: any) => { found = require; } }, [[id]]]);
  if (!found?.c || !found.m) return;
  delete found.m[id]; delete found.c[id];
  cached = { queue, runtime: found };
  return found;
}

export function dispatchPlayerAction(action: PlayerAction) {
  const current = runtime();
  for (const [key, module] of Object.entries(current?.c ?? {}) as [string, any][]) {
    const source = String(current.m[key]);
    if (!source.includes('awakeFirstVideoAcj') || !source.includes('lianmaireloadVideo')) continue;
    const dispatch = Object.values(module.exports).find(value => typeof value === 'function' && value.length === 1);
    if (typeof dispatch !== 'function') continue;
    // 新主屏接收跨播放器动作桥，旧控制栏的 actions.call 不会直接转发。
    dispatch(action);
    return;
  }
  throw new Error('原生播放器动作桥尚未就绪');
}
