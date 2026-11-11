import type { PlayerStore } from './player';
import type { ViolationEvent } from '../../features/playback/violation';
import { dispatchPlayerAction } from './player-actions';
import { diagnostics } from '../../core/diagnostics';

interface NativeTarget { instance: any; store: any; host: HTMLElement }
interface Snapshot { ii: unknown; timestamp: number; now: number; content: string; clientTime: number }
interface Binding extends NativeTarget { snapshot?: Snapshot; restore(replay: boolean): void }

function nativeTarget(): NativeTarget | undefined {
  const host = document.getElementById('__h5player');
  if (!host) return;
  const key = Object.keys(host).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
  let root = key ? (host as any)[key] : undefined;
  while (root?.return) root = root.return;
  const stack = [root?.stateNode?.current ?? root];
  while (stack.length) {
    const fiber = stack.pop();
    if (!fiber) continue;
    const instance = fiber.stateNode;
    if (typeof instance?.netIllegalEvent === 'function' && typeof instance.jsBreakRuleTip === 'function'
      && typeof instance.ILLEGAL_CLOSE_TIME === 'number' && instance.actions?.call) {
      for (let parent = fiber; parent; parent = parent.return) {
        const store = parent.memoizedProps?.store ?? parent.stateNode?.context?.store;
        if (typeof store?.getState?.()?.getIn === 'function') return { instance, store, host };
      }
    }
    stack.push(fiber.sibling, fiber.child);
  }
}

function currentSnapshot(instance: any): Snapshot | undefined {
  const message = instance.props.riiInfo?.toJS();
  const login = instance.props.loginres?.toJS();
  if (!message && !login) return;
  return message ? snapshot(message) : snapshot({ ii: login.is_illegal, timestamp: login.ill_ts,
    now: login.now, content: login.ill_ct, clientTime: login.clientTime });
}

function snapshot(data: any): Snapshot {
  return { ii: data.ii, timestamp: Number(data.timestamp), now: Number(data.now),
    content: typeof data.content === 'string' ? data.content : '', clientTime: Number(data.clientTime) || Date.now() };
}

function serverNow(value: Snapshot) { return value.now + (Date.now() - value.clientTime) / 1000; }
function canPlay(target: NativeTarget) {
  // 正式封禁图片和下播状态独立于整改，始终保留其停止播放与取流门禁。
  return target.store.getState().getIn(['app', 'Status']) === true
    && !target.host.querySelector('[class*="closure-"]');
}

export function mountViolationPlayback(player: PlayerStore, update: (event: ViolationEvent | null) => void, report: (message: string) => void) {
  let enabled = false, binding: Binding | undefined, room: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  let signature = '', error = '';

  function publish(event: ViolationEvent | null) {
    const next = JSON.stringify(event);
    if (signature !== next) { signature = next; update(event); }
  }
  function issue(next: string) { if (error !== next) { error = next; report(next); } }
  function release(replay = false) {
    const previous = binding;
    binding = undefined;
    clearTimeout(expiry); expiry = undefined;
    previous?.restore(replay);
    publish(null);
  }
  function show() {
    const current = binding, value = current?.snapshot;
    const active = !!current && !!value && Number(value.ii) === 1 && canPlay(current)
      && value.timestamp > 0 && serverNow(value) - value.timestamp < current.instance.ILLEGAL_CLOSE_TIME;
    publish(active ? { active: true, startedAt: value.timestamp * 1000, content: value.content } : null);
  }
  function receive(current: Binding, value: Snapshot) {
    if (binding !== current) return;
    current.snapshot = value;
    clearTimeout(expiry); expiry = undefined;
    if (Number(value.ii) === 1) {
      const remaining = current.instance.ILLEGAL_CLOSE_TIME - (serverNow(value) - value.timestamp);
      if (remaining > 0) expiry = setTimeout(show, remaining * 1000);
    }
    show();
  }

  function bind(target: NativeTarget) {
    const { instance, store, host } = target;
    const originals = new Map<string, { descriptor?: PropertyDescriptor; wrapped: unknown }>();
    const originalEvent = instance.netIllegalEvent;
    const wasBlocked = !!instance.state.isIll;
    const current: Binding = { ...target, restore(replay) {
      for (const [name, value] of originals) {
        if (instance[name] !== value.wrapped) continue;
        if (value.descriptor) Object.defineProperty(instance, name, value.descriptor);
        else delete instance[name];
      }
      if (!replay || !host.isConnected) return;
      const latest = nativeTarget();
      if (latest?.instance !== instance) return;
      const value = current.snapshot;
      if (value && canPlay(current)) originalEvent({ ...value, now: serverNow(value) });
      instance.forceUpdate();
    } };
    function replace(name: string, wrapped: unknown) {
      originals.set(name, { descriptor: Object.getOwnPropertyDescriptor(instance, name), wrapped });
      Object.defineProperty(instance, name, { configurable: true, writable: true, value: wrapped });
    }
    binding = current;
    const actions = instance.actions, scopedActions = Object.create(actions);
    // 官方已注册绑定后的回调；按实例限制其动作，保留注册表与回调身份。
    scopedActions.call = (action: any) => {
      if (action.id === 'app' && ['setFullScreen', 'setPagescreen'].includes(action.action) && action.data?.[0] === false) return;
      return actions.call(action);
    };
    replace('actions', scopedActions);
    replace('netIllegalEvent', (data: any) => receive(current, snapshot(data)));
    // 只替换此整改组件的生命周期；其他来源的暂停、刷新和关闭动作照常执行。
    replace('componentDidUpdate', (previous: any) => {
      if (previous.loginres !== instance.props.loginres || previous.riiInfo !== instance.props.riiInfo) {
        const value = currentSnapshot(instance);
        if (value) receive(current, value);
      }
    });
    replace('render', () => null);
    clearTimeout(instance.illegalCloseIndex);
    instance.illegalCloseIndex = undefined;
    const value = currentSnapshot(instance);
    if (value) receive(current, value);
    instance.setState({ isIll: 0 });
    instance.forceUpdate();
    if (wasBlocked && canPlay(current) && Number(value?.ii) === 1) {
      const stopped = store.getState().getIn(['videoModule', 'player', 'isPlay']) === false;
      instance.actions.call({ id: 'illegal', action: 'changeIllegal', data: [0] });
      dispatchPlayerAction({ id: 'videoModule', action: 'setPlay', data: [true] });
      instance.actions.call({ id: 'videoModule', action: 'setPlay', data: [true] });
      if (!stopped) dispatchPlayerAction({ id: 'LoadVideoNet', action: 'reloadVideo', data: [{ manual: true }] });
    }
    diagnostics.report('playback.keepViolationPlayback', 'applied', '已接管主屏整改组件及其全屏回调；正式封禁和下播保留官方处理');
  }

  function sync() {
    if (!enabled) return;
    try {
      const target = nativeTarget(), nextRoom = player.value.roomId;
      if (binding && (binding.instance !== target?.instance || room !== nextRoom)) release();
      room = nextRoom;
      if (!target || !room) {
        const terminal = !!document.querySelector('#__h5player [class*="closure-"], #__h5player [class*="recommendView-"]');
        diagnostics.report('playback.keepViolationPlayback', terminal ? 'idle' : 'unmatched', terminal ? '当前为封禁或下播页面，不接管' : '等待已提交的主屏 netIllegalEvent / jsBreakRuleTip 组件');
        issue(''); return;
      }
      const rg = Number(target.instance.props.rg), pg = Number(target.instance.props.pg);
      if (rg > 1 && rg !== 4 || pg > 1) { release(true); diagnostics.report('playback.keepViolationPlayback', 'idle', '当前为官方管理视角，保留原生整改处理'); return; }
      if (!binding) bind(target);
      show(); issue('');
    } catch (cause) {
      release(true);
      const message = cause instanceof Error ? cause.message : String(cause);
      diagnostics.report('playback.keepViolationPlayback', 'error', message);
      issue(`整改期间继续播放：${message}`);
    }
  }
  const stop = player.subscribe(sync);
  return {
    apply(value: boolean) {
      if (enabled === value) return;
      enabled = value;
      if (value) { sync(); timer = setInterval(sync, 1000); }
      else { clearInterval(timer); timer = undefined; release(true); issue(''); }
    },
    dispose() { enabled = false; stop(); clearInterval(timer); release(true); },
  };
}
