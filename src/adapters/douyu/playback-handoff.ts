import type { PlayerStore } from './player';
import { isMainPlayerReady, mainPlayback } from './player-actions';
import { diagnostics } from '../../core/diagnostics';
import './playback-handoff.css';

interface Transition {
  room: string | null;
  original: HTMLVideoElement;
  host: HTMLElement;
  video: HTMLVideoElement;
  abort: AbortController;
  sdk?: any;
  audio?: () => void;
  shown: boolean;
  held: boolean;
  pending?: Promise<boolean>;
  status: HTMLElement;
  root: HTMLElement;
}

interface Line { cdn: string; name: string }

function cdnLines(quality: any): Line[] {
  return quality?.props.cdnsWithName?.toJS?.() ?? quality?.props.cdnsWithName ?? [];
}

function waitFrames(video: HTMLVideoElement, ready: () => boolean, signal: AbortSignal, timeout: number) {
  return new Promise<void>((resolve, reject) => {
    let frame = 0, count = 0, first = 0, last = 0, time = 0;
    const finish = (error?: unknown) => {
      clearTimeout(timer); clearInterval(check); video.cancelVideoFrameCallback(frame);
      signal.removeEventListener('abort', abort); error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason ?? new Error('切换已取消'));
    const next: VideoFrameRequestCallback = (now, metadata) => {
      try {
        if (ready() && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !video.paused && video.videoWidth > 0) {
          if (!count || now - last > 250 || metadata.mediaTime <= time) { first = metadata.mediaTime; count = 0; }
          time = metadata.mediaTime; last = now; count++;
          if (count >= 6 && time - first >= 0.15) { finish(); return; }
        } else count = 0;
        frame = video.requestVideoFrameCallback(next);
      } catch (error) { finish(error); }
    };
    const timer = timeout ? setTimeout(() => finish(new Error('目标画面未能连续播放')), timeout) : undefined;
    const check = setInterval(() => {
      try { if (video.error || video.ended) throw new Error('直播流已结束或播放失败'); ready(); }
      catch (error) { finish(error); }
    }, 100);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else frame = video.requestVideoFrameCallback(next);
  });
}

function limited<T>(promise: Promise<T>, signal: AbortSignal, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (callback: () => void) => { clearTimeout(timer); signal.removeEventListener('abort', abort); callback(); };
    const abort = () => finish(() => reject(signal.reason ?? new Error('切换已取消')));
    const timer = setTimeout(() => finish(() => reject(new Error('准备过渡直播流超时'))), timeout);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

function controls() {
  const bar = document.getElementById('js-player-controlbar'), roots = new Set<any>();
  let quality: any, codec: any, playback: any;
  for (const element of bar ? [bar, ...bar.querySelectorAll('*')] : []) {
    const key = Object.keys(element).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
    let root = key ? (element as any)[key] : undefined;
    while (root?.return) root = root.return;
    root = root?.stateNode?.current ?? root;
    if (!root || roots.has(root)) continue;
    roots.add(root);
    const stack = [root];
    while (stack.length) {
      const fiber = stack.pop(), value = fiber?.stateNode;
      if (!fiber) continue;
      if (typeof value?.onMultirateChange === 'function' && Array.isArray(value.props?.multirates)) quality = value;
      if (typeof value?.selectCodec === 'function') codec = value;
      if (typeof value?.checkSwitch === 'function') playback = value;
      if (quality && codec && playback) return { quality, codec, playback };
      stack.push(fiber.sibling, fiber.child);
    }
  }
  return { quality, codec, playback };
}

export function mountPlaybackHandoff(player: PlayerStore,
  handoffAudio: (video: HTMLVideoElement, signal: AbortSignal) => Promise<() => void>, report: (message: string) => void) {
  let active: Transition | undefined, root: Element | null = null, native = controls(), stopped = false;
  let boundQuality: any, boundCodec: any;
  let changeLine: ((line: Line) => any) | undefined;
  const bindings = new Map<string, () => void>();
  const publish = (status: 'waiting' | 'applied' | 'idle' | 'error', detail: string) => diagnostics.report('playback.switch', status, detail, '交接');
  const valid = (value: Transition) => !stopped && active === value && value.room === player.value.roomId
    && value.original === player.value.video && value.host.isConnected;

  function positionStatus(value: Transition) {
    const rect = value.host.getBoundingClientRect();
    value.status.style.top = `${Math.max(0, -rect.top) + 12}px`;
    value.status.style.left = `${Math.max(0, -rect.left) + 12}px`;
  }

  function finish(value: Transition) {
    if (active !== value) return;
    active = undefined;
    value.abort.abort(new Error('过渡实例已释放'));
    value.audio?.(); value.audio = undefined;
    value.sdk?.dispose(); value.video.remove(); value.status.remove();
    delete value.root.dataset.guanyuSwitching;
    delete value.root.dataset.guanyuSwitchCover;
  }
  function requests() {
    const service = mainPlayback()?.service?.constructor, original = service?.loadStream;
    if (typeof original !== 'function') throw new Error('官方主屏取流入口尚未就绪');
    const state = { count: 0, finished: false, error: undefined as unknown };
    const load = function(this: any, ...args: any[]) {
      const serial = ++state.count; state.finished = false; state.error = undefined;
      let result: any;
      try { result = original.apply(this, args); }
      catch (error) { state.error = error; state.finished = true; throw error; }
      Promise.resolve(result).then(() => { if (state.count === serial) state.finished = true; }, error => {
        if (state.count === serial) { state.error = error; state.finished = true; }
      });
      return result;
    };
    service.loadStream = load;
    return { state, restore() { if (service.loadStream === load) service.loadStream = original; } };
  }
  async function prepare(value: Transition) {
    const current = mainPlayback(), quality = native.quality;
    if (!current?.player || typeof current.service?.constructor.getH5Play !== 'function' || !quality) throw new Error('官方直播流服务尚未就绪');
    const lines = cdnLines(quality);
    const cdn = lines.find((line: any) => line.cdn === 'hw-h5') ?? lines.find((line: any) => line.cdn === 'hs-h5') ?? lines[0];
    // 启动预载 URL 可能只有数秒内容，单独读取官方连续流，不修改主屏的流状态。
    const data: any = await limited(current.service.constructor.getH5Play({ rate: Number(quality.props.rate), cdn: cdn?.cdn || '' }), value.abort.signal, 10000);
    if (!valid(value) || value.abort.signal.aborted) throw new Error('直播间已变化');
    if (!data?.rtmp_url || !data.rtmp_live || Number(data.room_id) !== Number(quality.props.rid)) throw new Error('官方未提供当前房间的过渡直播流');
    const url = new URL(`${data.rtmp_url}/${data.rtmp_live}`);
    if (!['https:', 'http:'].includes(url.protocol) || !url.pathname.includes('.flv')) throw new Error('当前线路暂不支持平滑交接');
    const source = current.codec === 'h265' && data.player_1 ? data.player_1 : url.href;
    const sdk = new current.player.constructor({ url: source, mode: 'live', mediaHandle: current.player.mediaHandle,
      enableWorker: true, autoDispose: false, dropVideoWhenBg: false });
    value.sdk = sdk;
    let failure: unknown;
    sdk.on('player_error', (error: any) => { failure = new Error(`过渡直播流播放失败${error?.errorId ? `（${error.errorId}）` : ''}`); });
    sdk.attach(value.video); sdk.load(); void Promise.resolve(sdk.play()).catch(error => { failure = error; });
    await waitFrames(value.video, () => { if (failure) throw failure; return valid(value); }, value.abort.signal, 10000);
    // 备用流先对齐原画面的直播时间，避免接管时先回跳一次。
    await waitFrames(value.video, () => {
      if (failure) throw failure;
      if (!valid(value)) return false;
      const target = value.original.currentTime;
      if (Math.abs(target - value.video.currentTime) <= 0.12) return true;
      const ranges = value.video.buffered;
      for (let index = 0; index < ranges.length; index++) {
        if (target >= ranges.start(index) && target < ranges.end(index) - 0.1) {
          value.video.currentTime = target;
          if (value.video.paused) void value.video.play().catch(error => { failure = error; });
          return false;
        }
      }
      if (value.video.currentTime > target) value.video.pause();
      return false;
    }, value.abort.signal, 10000);
    value.audio = await limited(handoffAudio(value.video, value.abort.signal), value.abort.signal, 10000);
    if (!valid(value)) throw new Error('直播间已变化');
    value.video.style.opacity = '1'; value.shown = true;
    value.root.dataset.guanyuSwitchCover = '';
  }
  function hold(value: Transition) {
    value.held = true;
    void waitFrames(value.original, () => !value.pending && valid(value) && isMainPlayerReady(), value.abort.signal, 0).then(() => {
      if (valid(value)) { finish(value); report(''); publish('applied', '官方画面已恢复，已释放过渡播放器'); }
    }).catch(() => {});
  }
  async function execute(value: Transition, action: () => any, rollback: () => any) {
    let request: ReturnType<typeof requests> | undefined;
    try {
      if (!value.shown) { publish('waiting', '当前画面继续播放，正在准备过渡直播流'); await prepare(value); }
      request = requests();
      publish('waiting', '过渡画面持续播放，正在加载目标画面');
      await action();
      if (!request.state.count) { finish(value); publish('idle', '官方未开始切流，已保留当前画面'); return false; }
      await waitFrames(value.original, () => {
        if (request!.state.error) throw request!.state.error;
        return valid(value) && request!.state.count > 0 && request!.state.finished && isMainPlayerReady();
      }, value.abort.signal, 15000);
      finish(value); report(''); publish('applied', '目标画面已连续出帧，已交还官方播放器并释放过渡实例');
      return true;
    } catch (cause) {
      if (!valid(value) || value.abort.signal.aborted) { finish(value); return false; }
      const detail = cause instanceof Error ? cause.message : String(cause);
      if (value.shown && native.playback?.props.isPlay === false) { hold(value); publish('idle', '播放已暂停，恢复后继续交接'); return false; }
      if (value.shown && request?.state.count) {
        try {
          request.state.count = 0; request.state.error = undefined; request.state.finished = false;
          publish('waiting', '目标画面未就绪，正在恢复原播放选择');
          await rollback();
          await waitFrames(value.original, () => {
            if (request!.state.error) throw request!.state.error;
            return valid(value) && request!.state.count > 0 && request!.state.finished && isMainPlayerReady();
          }, value.abort.signal, 10000);
        } catch { if (valid(value)) hold(value); }
      }
      if (!value.held) finish(value);
      const message = value.held ? `${detail}，继续播放过渡画面，可重新选择画质或刷新` : `${detail}，已保留原播放选择`;
      report(message); publish('error', message); return false;
    } finally { request?.restore(); }
  }
  function run(label: string, action: () => any, rollback: () => any) {
    if (stopped) return action();
    if (active?.pending) return active.pending;
    const video = player.value.video, current = mainPlayback();
    if (!active?.held && (!video || video.paused || video.readyState < 3 || !isMainPlayerReady()
      || current?.codec === 'rtc' || current?.player?.mediaHandle !== 'mse' || typeof video.requestVideoFrameCallback !== 'function')) return action();
    if (!active?.held) {
      const host = document.getElementById('js-player-video-first');
      const playerRoot = document.getElementById('js-player-main');
      if (!host || !video || !playerRoot) return action();
      const cover = document.createElement('video'); cover.muted = true; cover.autoplay = true; cover.playsInline = true;
      cover.setAttribute('aria-hidden', 'true'); cover.dataset.guanyuHandoff = '';
      cover.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;opacity:0.001;pointer-events:none;z-index:1';
      host.append(cover);
      const status = document.createElement('div');
      status.className = 'guanyu-playback-switch'; status.setAttribute('role', 'status');
      host.append(status);
      active = { room: player.value.roomId, original: video, host, video: cover, abort: new AbortController(), shown: false, held: false, status, root: playerRoot };
    }
    const value = active!; value.held = false;
    value.status.textContent = `正在切换到${label}…`;
    positionStatus(value);
    value.root.dataset.guanyuSwitching = '';
    value.pending = execute(value, action, rollback).finally(() => {
      value.pending = undefined;
      if (active === value && value.held) {
        delete value.root.dataset.guanyuSwitching;
        value.status.textContent = '目标未就绪，当前画面继续播放，可重新选择或刷新';
      }
    });
    return value.pending;
  }
  function bind(target: any, key: string, invoke: (original: Function, receiver: any, args: any[]) => any) {
    bindings.get(key)?.();
    const descriptor = Object.getOwnPropertyDescriptor(target, key), original = target[key];
    const wrapped = function(this: any, ...args: any[]) { return invoke(original, this, args); };
    target[key] = wrapped;
    bindings.set(key, () => { if (target[key] !== wrapped) return; if (descriptor) Object.defineProperty(target, key, descriptor); else delete target[key]; });
  }
  function switchLine(line: Line, action: () => any) {
    const quality = native.quality, restore = changeLine;
    const previous = { cdn: quality.props.cdn, name: cdnLines(quality).find(item => item.cdn === quality.props.cdn)?.name || '原线路' };
    return run(line.name || '所选线路', action, () => restore?.(previous));
  }
  function onLineClick(event: MouseEvent) {
    const item = event.target instanceof Element ? event.target.closest('.menu-da2a9e li') : null;
    if (!item || !native.codec?.menu?.contains(item) || !changeLine) return;
    const name = item.textContent?.trim().replace(/^✓\s*/, '');
    const line = cdnLines(native.quality).find(line => line.name === name);
    if (!line || line.cdn === native.quality.props.cdn) return;
    const key = Object.keys(item).find(key => key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$'));
    const handler = key && (item as any)[key]?.onClick;
    if (typeof handler !== 'function') return;
    event.preventDefault(); event.stopImmediatePropagation();
    native.codec.hideMenu(event);
    void switchLine(line, () => handler.call(item, event));
  }
  function sync() {
    if (stopped) return;
    if (active) {
      if (!valid(active)) finish(active);
      else {
        positionStatus(active);
        const style = getComputedStyle(active.original); active.video.style.objectFit = style.objectFit; active.video.style.transform = style.transform;
        if (active.shown && native.playback?.props.isPlay === false) active.video.pause();
        else if (active.shown && active.video.paused && !active.video.ended) void active.video.play().catch(() => {});
      }
    }
    const next = document.getElementById('__h5player');
    if (root === next && boundQuality?.ratediv?.isConnected && boundCodec?._reactInternalFiber?.return) return;
    if (root !== next) { bindings.forEach(restore => restore()); bindings.clear(); boundQuality = boundCodec = changeLine = undefined; root = next; }
    native = controls();
    if (native.quality && boundQuality !== native.quality) {
      const quality = native.quality; boundQuality = quality;
      bind(quality, 'onMultirateChange', (original, receiver, args) => {
        const previous = quality.props.multirates.find((item: any) => Number(item.type) === Number(quality.props.rate));
        return run(args[0]?.name || '所选画质', () => original.apply(receiver, args), () => original.call(receiver, previous ?? args[0]));
      });
      const select = quality.selectXL;
      if (typeof select === 'function') {
        changeLine = line => select.call(quality, { target: { value: line.cdn, name: line.name } });
        bind(quality, 'selectXL', (_original, _receiver, args) => {
          const target = args[0]?.target, line = { cdn: target?.value, name: target?.name };
          if (!line.cdn || line.cdn === quality.props.cdn) return select.apply(quality, args);
          return switchLine(line, () => changeLine!(line));
        });
      } else changeLine = undefined;
    }
    if (native.codec && boundCodec !== native.codec) {
      const codec = native.codec; boundCodec = codec;
      bind(codec, 'selectCodec', (original, receiver, args) => {
        const previous = codec.state.preferCodec;
        return run(args[0] === 'hevc' ? 'H.265' : args[0] === 'h264' ? 'H.264' : '自动编码', () => original.apply(receiver, args), () => original.call(receiver, previous));
      });
    }
  }
  document.addEventListener('click', onLineClick, true);
  const stop = player.subscribe(sync), timer = setInterval(sync, 500);
  return { dispose() { stopped = true; stop(); clearInterval(timer); document.removeEventListener('click', onLineClick, true); if (active) finish(active); bindings.forEach(restore => restore()); bindings.clear(); } };
}
