import type { MultiScreenNative } from './multiscreen';
import type { QualityPort, QualitySnapshot } from '../../features/multiscreen/quality';
import { readMultiscreenRates } from './multiscreen-rates';

interface Binding {
  id: number;
  component: any;
  stream: any;
  desired: number | null;
  snapshot: QualitySnapshot;
  request?: AbortController;
  finish?: (error?: Error) => void;
  restore: () => void;
}

export function createNativeMultiQuality(getNative: () => MultiScreenNative): QualityPort {
  const bindings = new Map<number, Binding>();
  let receive = (_id: number, _value: QualitySnapshot) => {};
  const publish = (binding: Binding) => receive(binding.id, { ...binding.snapshot });
  async function readRates(binding: Binding) {
    if (binding.request) return;
    const request = new AbortController(); binding.request = request;
    const active = () => bindings.get(binding.id) === binding && binding.request === request;
    binding.snapshot.loading = true; binding.snapshot.error = ''; publish(binding);
    const timer = setTimeout(() => request.abort(new Error('读取清晰度超时，请重试')), 15000);
    try {
      const rates = await readMultiscreenRates(binding.stream, binding.id, request.signal);
      // 独立请求只补档位列表，不能把它的返回档位当成当前视频已经生效的画质。
      if (active() && !binding.snapshot.rates.length) binding.snapshot.rates = rates;
    } catch (cause) {
      if (active() && !binding.snapshot.rates.length) binding.snapshot.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearTimeout(timer);
      if (active()) { binding.request = undefined; binding.snapshot.loading = false; publish(binding); }
    }
  }
  function bind(component: any, id: number): Binding {
    const stream = component.baseStream;
    const binding: Binding = { id, component, stream, desired: null,
      snapshot: { rates: [], rate: null, ready: false, loading: false, error: '' }, restore() {} };
    const originals = { play: stream.play, data: stream.stramDataCallback, ready: stream.onreadyBackFunction, error: stream.errBackFunction };
    let response: any;
    const active = () => bindings.get(id) === binding;
    const play = function(this: any, options: any) {
      if (active()) { response = undefined; binding.snapshot.ready = false; publish(binding); }
      // 官方刷新仍调用固定档位；只在当前实例上覆盖本次会话已选择的画质。
      return originals.play.call(this, active() && Number(options?.rid) === id && binding.desired !== null ? { ...options, rate: binding.desired } : options);
    };
    const data = function(this: any, result: any) {
      if (active()) {
        try {
          if (Number(result?.error) !== 0) throw new Error(result?.msg || '官方取流失败');
          response = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
          if (!Array.isArray(response?.multirates) || !Number.isFinite(Number(response.rate))) throw new Error('官方尚未提供清晰度');
          binding.snapshot = { rates: response.multirates.map((item: any) => ({ rate: Number(item.rate), name: String(item.name), diamondFan: Number(item.diamondFan) })),
            rate: Number(response.rate), ready: false, loading: !!binding.request, error: '' }; publish(binding);
        } catch (cause) {
          response = undefined; const error = cause instanceof Error ? cause : new Error(String(cause));
          binding.snapshot = { ...binding.snapshot, ready: false, error: error.message }; publish(binding); binding.finish?.(error);
        }
      }
      return originals.data?.call(this, result);
    };
    const ready = function(this: any, event: any) {
      const result = originals.ready?.call(this, event);
      if (active() && response) { binding.snapshot.ready = true; binding.desired = binding.snapshot.rate; publish(binding); binding.finish?.(); }
      return result;
    };
    const error = function(this: any, event: any) {
      const result = originals.error?.call(this, event);
      if (active()) { binding.snapshot.ready = false; publish(binding); binding.finish?.(new Error('目标画面未能恢复播放')); }
      return result;
    };
    stream.play = play; stream.stramDataCallback = data; stream.onreadyBackFunction = ready; stream.errBackFunction = error;
    binding.restore = () => {
      binding.request?.abort(); binding.request = undefined;
      binding.finish?.(new Error('分屏已变化，请重新选择'));
      if (stream.play === play) stream.play = originals.play;
      if (stream.stramDataCallback === data) stream.stramDataCallback = originals.data;
      if (stream.onreadyBackFunction === ready) stream.onreadyBackFunction = originals.ready;
      if (stream.errBackFunction === error) stream.errBackFunction = originals.error;
    };
    return binding;
  }
  function mainRate() {
    return getNative().component(document.getElementById('js-player-controlbar'), (value: any) => typeof value.onMultirateChange === 'function' && Array.isArray(value.props?.multirates));
  }
  async function switchStream(binding: Binding, rate: number) {
    binding.desired = rate;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => binding.finish?.(new Error('切换画质超时，请重试')), 15000);
      binding.finish = error => { clearTimeout(timer); binding.finish = undefined; error ? reject(error) : resolve(); };
      try { binding.component.play(binding.id); }
      catch (cause) { binding.finish?.(cause instanceof Error ? cause : new Error(String(cause))); }
    });
  }
  return {
    listen(next) { receive = next; },
    sync() {
      const native = getNative(), ids = native.order();
      for (const [id, binding] of bindings) if (!ids.includes(id) || !binding.component.contDom?.isConnected) { binding.restore(); bindings.delete(id); }
      const rate = mainRate();
      if (rate) receive(native.roomId, { rates: rate.props.multirates.map((item: any) => ({ ...item, rate: Number(item.type ?? item.rate) })), rate: Number(rate.props.rate), ready: true, loading: false, error: '' });
      for (const slot of Array.from(native.container?.children ?? [])) {
        const component = native.component(slot, (value: any) => !!value.baseStream && typeof value.play === 'function');
        const id = Number(component?.props.rid);
        if (!component || id === native.roomId || !ids.includes(id)) continue;
        if (bindings.get(id)?.stream === component.baseStream) continue;
        bindings.get(id)?.restore();
        const binding = bind(component, id); bindings.set(id, binding); void readRates(binding);
      }
    },
    async read(id) { const binding = bindings.get(id); if (binding) await readRates(binding); },
    async change(id, rate) {
      const native = getNative();
      if (!native.active() || !native.order().includes(id)) throw new Error('分屏已变化，请重新选择');
      if (id === native.roomId) {
        const control = mainRate(), item = control?.props.multirates.find((item: any) => Number(item.type ?? item.rate) === rate);
        if (!item) throw new Error('原生画质尚未就绪');
        await control.onMultirateChange(item); return;
      }
      const binding = bindings.get(id);
      if (!binding) throw new Error('官方副屏尚未就绪');
      const previous = binding.snapshot.ready ? binding.snapshot.rate : null;
      try { await switchStream(binding, rate); }
      catch (cause) {
        if (previous !== null && bindings.get(id) === binding && binding.component.contDom?.isConnected) {
          try { await switchStream(binding, previous); } catch { throw new Error('切换失败，原画质也未能恢复，请重连此画面'); }
        }
        throw cause;
      }
    },
    dispose() { for (const binding of bindings.values()) binding.restore(); bindings.clear(); },
  };
}
