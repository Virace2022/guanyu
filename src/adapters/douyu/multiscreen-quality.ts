import type { MultiScreenNative } from './multiscreen';
import type { QualityPort, QualitySnapshot } from '../../features/multiscreen/quality';
import type { PlaybackController } from '../../features/playback/controller';
import { playMultiscreenStream, readMultiscreenStream } from './multiscreen-rates';
import { mountSecondaryRefresh } from './multiscreen-refresh';
import { canHandoffVideo, withHandoffStatus } from './video-handoff';

interface Binding {
  id: number;
  component: any;
  stream: any;
  desired: number | null;
  desiredLine?: string;
  snapshot: QualitySnapshot;
  request?: AbortController;
  playRequest?: AbortController;
  handoff?: ReturnType<typeof mountSecondaryRefresh>;
  finish?: (error?: Error) => void;
  restore: () => void;
}

export function createNativeMultiQuality(getNative: () => MultiScreenNative, refreshMainPlayback: PlaybackController['refreshMain']): QualityPort {
  const bindings = new Map<number, Binding>();
  let mainRefresh: { isCurrent: () => boolean; abort: AbortController } | undefined;
  let session = 0;
  let receive = (_id: number, _value: QualitySnapshot) => {};
  const publish = (binding: Binding) => receive(binding.id, { ...binding.snapshot });
  async function readRates(binding: Binding) {
    if (binding.request) return;
    const request = new AbortController(); binding.request = request;
    const active = () => bindings.get(binding.id) === binding && binding.request === request;
    binding.snapshot.loading = true; binding.snapshot.error = ''; publish(binding);
    const timer = setTimeout(() => request.abort(new Error('读取清晰度超时，请重试')), 15000);
    try {
      const data = await readMultiscreenStream(binding.stream, binding.id, request.signal);
      // 独立请求只补档位列表，不能把它的返回档位当成当前视频已经生效的画质。
      if (active()) {
        if (!binding.snapshot.rates.length) binding.snapshot.rates = data.multirates.map((item: any) => ({ rate: Number(item.rate), name: String(item.name), diamondFan: Number(item.diamondFan) }));
        if (!binding.snapshot.lines?.length) binding.snapshot.lines = streamLines(data);
      }
    } catch (cause) {
      if (active() && !binding.snapshot.rates.length) binding.snapshot.error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearTimeout(timer);
      if (active()) { binding.request = undefined; binding.snapshot.loading = false; publish(binding); }
    }
  }
  function streamLines(data: any) {
    return (Array.isArray(data.cdnsWithName) ? data.cdnsWithName : []).filter((line: any) => typeof line.cdn === 'string' && typeof line.name === 'string').map((line: any) => ({ cdn: line.cdn, name: line.name }));
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
      binding.playRequest?.abort(); binding.playRequest = undefined;
      // 官方刷新仍调用固定档位；只在当前实例上覆盖本次会话已选择的画质。
      const next = active() && Number(options?.rid) === id && binding.desired !== null ? { ...options, rate: binding.desired } : options;
      // 官方副屏固定走自动线路；只有明确选线后才替换本路取流，其他实例仍走原生路径。
      if (!active() || Number(options?.rid) !== id || !binding.desiredLine) return originals.play.call(this, next);
      originals.play.call(this, { ...next, type: 0, url: '' });
      const request = new AbortController(); binding.playRequest = request;
      const timer = setTimeout(() => request.abort(new Error('切换线路超时')), 15000);
      void readMultiscreenStream(stream, id, request.signal, Number(next.rate ?? 2), binding.desiredLine).then(result => {
        if (!active() || binding.playRequest !== request) return;
        playMultiscreenStream(stream, result);
      }).catch(cause => {
        if (!active() || binding.playRequest !== request) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        binding.snapshot.ready = false; binding.snapshot.error = error.message; publish(binding); binding.finish?.(error);
      }).finally(() => { clearTimeout(timer); if (binding.playRequest === request) binding.playRequest = undefined; });
    };
    const data = function(this: any, result: any) {
      if (active()) {
        try {
          if (Number(result?.error) !== 0) throw new Error(result?.msg || '官方取流失败');
          response = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
          if (!Array.isArray(response?.multirates) || !Number.isFinite(Number(response.rate))) throw new Error('官方尚未提供清晰度');
          binding.snapshot = { rates: response.multirates.map((item: any) => ({ rate: Number(item.rate), name: String(item.name), diamondFan: Number(item.diamondFan) })),
            rate: Number(response.rate), lines: streamLines(response), line: response.rtmp_cdn, ready: false, loading: !!binding.request, error: '' }; publish(binding);
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
      binding.handoff?.dispose(); binding.handoff = undefined;
      binding.request?.abort(); binding.request = undefined;
      binding.playRequest?.abort(); binding.playRequest = undefined;
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
  async function reloadStream(binding: Binding, action: () => void, timeout: string) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => binding.finish?.(new Error(timeout)), 15000);
      binding.finish = error => { clearTimeout(timer); binding.finish = undefined; error ? reject(error) : resolve(); };
      try { action(); }
      catch (cause) { binding.finish?.(cause instanceof Error ? cause : new Error(String(cause))); }
    });
  }
  function switchStream(binding: Binding, rate: number) {
    binding.desired = rate;
    return reloadStream(binding, () => binding.component.play(binding.id), '切换画质超时，请重试');
  }
  async function refreshMain(native: MultiScreenNative, slot: HTMLElement, roomName: string) {
    const id = native.roomId, abort = new AbortController(), currentSession = session;
    const isCurrent = () => session === currentSession && !abort.signal.aborted && slot.isConnected && native.active() && native.roomId === id
      && native.container?.children[native.order().indexOf(id)] === slot;
    const control = native.component(document.getElementById('js-player-video-case'), (value: any) => typeof value.onReplayer === 'function');
    if (!control) throw new Error('官方主屏刷新尚未就绪');
    const operation = { isCurrent, abort }; mainRefresh = operation;
    const reload = () => new Promise<void>((resolve, reject) => {
      if (!isCurrent()) { reject(new Error('分屏已变化，请重新选择')); return; }
      const finish = (error?: Error) => {
        clearTimeout(timer); slot.removeEventListener('playing', playing, true); abort.signal.removeEventListener('abort', cancel);
        error ? reject(error) : resolve();
      };
      const playing = (event: Event) => { if (event.target === slot.querySelector('video')) finish(); };
      const timer = setTimeout(() => finish(new Error('刷新超时，请重试此画面')), 15000);
      const cancel = () => finish(new Error('分屏已变化，请重新选择'));
      abort.signal.addEventListener('abort', cancel, { once: true });
      slot.addEventListener('playing', playing, true);
      try { control.onReplayer(); }
      catch (cause) { finish(cause instanceof Error ? cause : new Error(String(cause))); }
    });
    try { await refreshMainPlayback(reload, slot, roomName, isCurrent); }
    finally { if (mainRefresh === operation) mainRefresh = undefined; }
  }
  return {
    listen(next) { receive = next; },
    sync() {
      const native = getNative(), ids = native.order();
      if (mainRefresh && !mainRefresh.isCurrent()) mainRefresh.abort.abort();
      for (const [id, binding] of bindings) {
        if (!ids.includes(id) || !binding.component.contDom?.isConnected) { binding.restore(); bindings.delete(id); }
        else if (binding.handoff) {
          binding.handoff.sync();
          if (!binding.handoff.active) binding.handoff = undefined;
        }
      }
      const rate = mainRate();
      if (rate) receive(native.roomId, { rates: rate.props.multirates.map((item: any) => ({ ...item, rate: Number(item.type ?? item.rate) })), rate: Number(rate.props.rate), lines: streamLines(rate.props), line: rate.props.cdn, ready: true, loading: false, error: '' });
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
    async refresh(id, roomName) {
      const native = getNative();
      const slot = native.container?.children[native.order().indexOf(id)];
      if (!native.active() || !(slot instanceof HTMLElement) || !slot.isConnected) throw new Error('分屏已变化，请重新选择');
      if (id === native.roomId) { await refreshMain(native, slot, roomName); return; }
      const binding = bindings.get(id);
      if (!binding || !binding.component.contDom?.isConnected || typeof binding.component.reloadHandler !== 'function') throw new Error('官方副屏刷新尚未就绪');
      // 官方未开播分支不会调用 play 初始化 rid，重载前补齐，避免请求到 undefined。
      binding.component.rid = id;
      const reload = () => reloadStream(binding, () => binding.component.reloadHandler(), '刷新超时，请重试此画面');
      const video = binding.stream.video, rate = binding.desired ?? binding.snapshot.rate;
      if (!binding.handoff?.active) {
        if (!(video instanceof HTMLVideoElement) || !slot.contains(video) || !canHandoffVideo(video)
          || binding.stream.player?.tag !== 'FlvPlayer') {
          await withHandoffStatus(slot, `正在刷新「${roomName}」…`, reload); return;
        }
        binding.handoff = mountSecondaryRefresh(slot, video, roomName);
      }
      await binding.handoff.refresh(binding.stream, { id, rate, line: binding.desiredLine ?? binding.snapshot.line }, reload, () => binding.snapshot.ready);
    },
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
    async changeLine(id, cdn) {
      const native = getNative();
      if (!native.active() || !native.order().includes(id)) throw new Error('分屏已变化，请重新选择');
      if (id === native.roomId) {
        const control = mainRate(), line = control?.props.cdnsWithName?.find((item: any) => item.cdn === cdn);
        if (!line || typeof control.selectXL !== 'function') throw new Error('原生线路尚未就绪');
        await control.selectXL({ target: { value: line.cdn, name: line.name } }); return;
      }
      const binding = bindings.get(id);
      if (!binding) throw new Error('官方副屏尚未就绪');
      const previous = binding.desiredLine, rate = binding.snapshot.rate ?? binding.desired ?? 2;
      binding.desiredLine = cdn;
      try { await switchStream(binding, rate); }
      catch (cause) {
        if (bindings.get(id) === binding && binding.component.contDom?.isConnected) {
          binding.desiredLine = previous;
          try { await switchStream(binding, rate); } catch { throw new Error('线路切换失败，原画面未能恢复，请刷新此画面'); }
        }
        throw cause;
      }
    },
    dispose() { session++; mainRefresh?.abort.abort(); for (const binding of bindings.values()) binding.restore(); bindings.clear(); },
  };
}
