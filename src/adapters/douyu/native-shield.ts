import { nativeShieldChoices, type NativeShieldOptions } from '../../config/options';
import { createState } from '../../core/state';

interface NativeChannel { subscriber?: unknown; next(message: unknown): void }
interface ShieldPage extends Window { __SHARK_INJECTABLE_CHANNEL__?: Record<string, NativeChannel> }
interface ShieldItem { id: number; type: string; text: string; state: number; isHidden?: boolean }

export function mountNativeShield(page: ShieldPage) {
  const state = createState('等待斗鱼原生屏蔽控件');
  let requested: NativeShieldOptions | undefined;
  let signature = '';
  let timer: ReturnType<typeof setInterval> | undefined;

  function stopWaiting() { clearInterval(timer); timer = undefined; }

  function refresh() {
    if (!requested) return;
    const channel = page.__SHARK_INJECTABLE_CHANNEL__?.['live.playerAsideModule.ShieldToolServices'];
    if (typeof channel?.subscriber !== 'function') return;
    function call(method: string, args: unknown[] = []) {
      let result: unknown;
      channel!.next({ method, args, subscriber: { next(value: unknown) { result = value; }, complete() {} } });
      return result;
    }
    try {
      const current = call('getShield');
      if (!current || typeof current !== 'object') return;
      const config = call('getToShieldData', [current]) as Record<string, ShieldItem> | undefined;
      if (!config || typeof config !== 'object') return;
      const items = nativeShieldChoices.map(choice => Object.values(config).find(item => item.type === choice.key));
      if (items.some(item => !item || !Number.isFinite(item.id) || ![0, 1].includes(item.state))) return;
      let skipped = 0;
      for (let index = 0; index < nativeShieldChoices.length; index++) {
        const item = items[index]!;
        if (item.isHidden) { skipped++; continue; }
        const desired = requested[nativeShieldChoices[index]!.key];
        config[item.id] = { ...item, state: desired ? 1 : 0 };
      }
      // 批量走官方状态和同步路径，避免逐项切换的异步回包用中间状态覆盖最终选择。
      call('updateReducerShield', [config]);
      call('sendFlashShield', [config]);
      stopWaiting();
      state.set(skipped ? `已应用屏蔽偏好，${skipped} 项当前不适用` : '已应用屏蔽偏好');
    } catch (error) {
      stopWaiting();
      state.set(`原生屏蔽应用失败：${String(error)}`);
    }
  }

  return {
    subscribe: state.subscribe,
    apply(value: NativeShieldOptions) {
      const next = JSON.stringify(value);
      if (signature === next) return;
      signature = next; requested = { ...value };
      stopWaiting();
      state.set('等待斗鱼原生屏蔽控件');
      timer = setInterval(refresh, 1000);
      refresh();
    },
    dispose() { stopWaiting(); },
  };
}
