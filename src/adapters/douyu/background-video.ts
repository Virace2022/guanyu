import type { PlayerStore } from './player';
import { dispatchPlayerAction } from './player-actions';
import { diagnostics } from '../../core/diagnostics';

interface Policy { switch: number | boolean; st: number; ct: number }
interface PlaybackRef {
  current: {
    isAudio: boolean;
    isJieliuSwitch: boolean;
    bgStart: number;
    jieliuReqTime: number;
    jieliu?: Policy;
    jieliuTimer?: ReturnType<typeof setTimeout>;
    player?: unknown;
    service?: { _memberRef?: PlaybackRef; constructor: PolicyService };
  };
}
interface PolicyService {
  getAutoSwitch: (...args: any[]) => Promise<Policy | null>;
}
interface Binding {
  ref: PlaybackRef;
  service: PolicyService;
  restore: () => void;
  recovered: boolean;
}

function ancestors(node: Element | null): any[] {
  if (!node) return [];
  const key = Object.keys(node).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
  let fiber = key ? (node as any)[key] : undefined, root = fiber;
  while (root?.return) root = root.return;
  if (root?.stateNode?.current === root?.alternate && fiber?.alternate) fiber = fiber.alternate;
  const result = [];
  for (; fiber; fiber = fiber.return) result.push(fiber);
  return result;
}

function mainPlayback(): PlaybackRef | undefined {
  for (const fiber of ancestors(document.getElementById('js-player-video-first'))) {
    for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const ref = hook.memoizedState, value = ref?.current;
      if (value && typeof value === 'object' && typeof value.jieliuReqTime === 'number'
        && typeof value.bgStart === 'number' && typeof value.isAudio === 'boolean'
        && value.service?._memberRef === ref && typeof value.service.constructor?.getAutoSwitch === 'function') return ref;
    }
  }
}

function reloadVideo() {
  dispatchPlayerAction({ id: 'LoadVideoNet', action: 'reloadVideo', data: [{ isnoLoading: true, isSmooth: true }] });
}

export function mountBackgroundVideo(player: PlayerStore, report: (message: string) => void) {
  let enabled = false, binding: Binding | undefined, room: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let message = '';
  const publish = (next: string) => { if (message !== next) { message = next; report(next); } };

  function release() {
    const previous = binding;
    binding = undefined;
    previous?.restore();
  }

  function bind(ref: PlaybackRef): Binding {
    const service = ref.current.service!.constructor, original = service.getAutoSwitch;
    const next: Binding = { ref, service, recovered: false, restore() {} };
    const wrapped = function(this: PolicyService, ...args: any[]) {
      return original.apply(this, args).then(policy => {
        // 在途请求按完成时的设置处理；同一引用关闭后再开启也不能漏过旧请求。
        if (enabled && binding?.ref === ref && binding.service === service && String(args[0]?.rid) === room
          && policy && typeof policy === 'object' && 'switch' in policy) {
          return { ...policy, switch: 0 };
        }
        return policy;
      });
    };
    service.getAutoSwitch = wrapped;
    next.restore = () => {
      if (service.getAutoSwitch === wrapped) service.getAutoSwitch = original;
      // 不补发后台期间错过的计时器，下次真实可见性切换重新请求官方策略。
      ref.current.jieliu = undefined;
      ref.current.jieliuReqTime = 0;
    };
    return next;
  }

  function sync() {
    if (!enabled) return;
    try {
      const ref = mainPlayback(), currentRoom = player.value.roomId;
      if (binding && (binding.ref !== ref || room !== currentRoom || binding.service !== ref?.current.service?.constructor)) release();
      room = currentRoom;
      if (!ref || !currentRoom) { diagnostics.report('playback.keepBackgroundVideo', 'unmatched', !currentRoom ? '尚未识别真实房间号' : '未找到主屏 React hook 中的节流引用及 service.constructor.getAutoSwitch'); publish('后台保持视频流：原生节流服务尚未就绪，当前保留官方行为'); return; }
      binding ??= bind(ref);
      const value = ref.current;
      clearTimeout(value.jieliuTimer);
      value.jieliuTimer = undefined;
      if (value.jieliu && 'switch' in value.jieliu && value.jieliu.switch) value.jieliu = { ...value.jieliu, switch: 0 };
      if (value.isAudio && value.isJieliuSwitch && value.bgStart && value.player && !binding.recovered) {
        reloadVideo();
        binding.recovered = true;
      }
      publish('');
      diagnostics.report('playback.keepBackgroundVideo', 'applied', '已接入原生 getAutoSwitch 策略并撤回后台节流计时器');
    } catch (cause) { diagnostics.report('playback.keepBackgroundVideo', 'error', cause instanceof Error ? cause.message : String(cause)); publish(`后台保持视频流：${cause instanceof Error ? cause.message : String(cause)}`); }
  }

  const stop = player.subscribe(sync);
  return {
    apply(value: boolean) {
      if (enabled === value) return;
      enabled = value;
      if (enabled) { sync(); timer = setInterval(sync, 1000); }
      else { clearInterval(timer); timer = undefined; release(); publish(''); }
    },
    dispose() { enabled = false; stop(); clearInterval(timer); release(); },
  };
}
