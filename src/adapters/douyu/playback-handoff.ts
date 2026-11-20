import type { PlayerStore } from './player';
import { isMainPlayerReady, mainPlayback } from './player-actions';
import { diagnostics } from '../../core/diagnostics';
import { alignRefreshedVideo, canHandoffVideo, limitHandoff, matchHandoffVideo, mountHandoffStatus, mountHandoffVideo, positionHandoffStatus, waitForStandby, waitFrames, withHandoffStatus } from './video-handoff';

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
  isCurrent?: () => boolean;
}

interface Line { cdn: string; name: string }
interface Operation {
  message: string;
  action: () => any;
  rollback?: () => any;
  refresh?: boolean;
  roomName?: string;
  isCurrent?: () => boolean;
}

function cdnLines(quality: any): Line[] {
  return quality?.props.cdnsWithName?.toJS?.() ?? quality?.props.cdnsWithName ?? [];
}

function clickHandler(element: Element) {
  const key = Object.keys(element).find(key => key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$'));
  return key ? (element as any)[key]?.onClick : undefined;
}

function controls() {
  const bar = document.getElementById('js-player-controlbar'), roots = new Set<any>();
  let quality: any, codec: any, playback: any, reload: any;
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
      if (typeof value?.clickReload === 'function') reload = value;
      if (quality && codec && playback && reload) return { quality, codec, playback, reload };
      stack.push(fiber.sibling, fiber.child);
    }
  }
  return { quality, codec, playback, reload };
}

export function mountPlaybackHandoff(player: PlayerStore,
  handoffAudio: (video: HTMLVideoElement, signal: AbortSignal) => Promise<() => void>, report: (message: string) => void) {
  let active: Transition | undefined, root: Element | null = null, native = controls(), stopped = false;
  let boundQuality: any, boundCodec: any;
  let changeLine: ((line: Line) => any) | undefined;
  const bindings = new Map<string, () => void>();
  const publish = (status: 'waiting' | 'applied' | 'idle' | 'error', detail: string) => diagnostics.report('playback.switch', status, detail, '交接');
  const valid = (value: Transition) => !stopped && active === value && value.room === player.value.roomId
    && value.original === player.value.video && value.host.isConnected && (value.isCurrent?.() ?? true);

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
  async function prepare(value: Transition, operation: Operation) {
    const current = mainPlayback(), quality = native.quality;
    if (!current?.player || typeof current.service?.constructor.getH5Play !== 'function' || !quality) throw new Error('官方直播流服务尚未就绪');
    const lines = cdnLines(quality);
    const standby = lines.find(line => line.cdn === 'hw-h5') ?? lines.find(line => line.cdn === 'hs-h5') ?? lines[0];
    const cdn = operation.refresh ? quality.props.cdn || '' : standby?.cdn || '';
    // 启动预载 URL 可能只有数秒内容，单独读取官方连续流，不修改主屏的流状态。
    const data: any = await limitHandoff(current.service.constructor.getH5Play({ rate: Number(quality.props.rate), cdn }), value.abort.signal, 10000);
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
    // 备用流先对齐原画面的直播时间，避免接管时先回跳一次。
    await waitForStandby(value.video, value.original, () => { if (failure) throw failure; return valid(value); }, value.abort.signal);
    value.audio = await limitHandoff(handoffAudio(value.video, value.abort.signal), value.abort.signal, 10000);
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
  async function execute(value: Transition, operation: Operation) {
    let request: ReturnType<typeof requests> | undefined;
    try {
      if (!value.shown) { publish('waiting', '当前画面继续播放，正在准备过渡直播流'); await prepare(value, operation); }
      request = requests();
      publish('waiting', '过渡画面持续播放，正在加载目标画面');
      await operation.action();
      if (!request.state.count) { finish(value); publish('idle', '官方未开始切流，已保留当前画面'); return false; }
      const ready = () => {
        if (request!.state.error) throw request!.state.error;
        return valid(value) && request!.state.count > 0 && request!.state.finished && isMainPlayerReady();
      };
      await waitFrames(value.original, ready, value.abort.signal, 15000);
      if (operation.refresh) await alignRefreshedVideo(value.original, value.video, ready, value.abort.signal);
      finish(value); report(''); publish('applied', '目标画面已连续出帧，已交还官方播放器并释放过渡实例');
      return true;
    } catch (cause) {
      if (!valid(value) || value.abort.signal.aborted) { finish(value); return false; }
      const detail = cause instanceof Error ? cause.message : String(cause);
      if (value.shown && native.playback?.props.isPlay === false) { hold(value); publish('idle', '播放已暂停，恢复后继续交接'); return false; }
      if (value.shown && request?.state.count) {
        if (!operation.rollback) hold(value);
        else {
          try {
            request.state.count = 0; request.state.error = undefined; request.state.finished = false;
            publish('waiting', '目标画面未就绪，正在恢复原播放选择');
            await operation.rollback();
            await waitFrames(value.original, () => {
              if (request!.state.error) throw request!.state.error;
              return valid(value) && request!.state.count > 0 && request!.state.finished && isMainPlayerReady();
            }, value.abort.signal, 10000);
          } catch { if (valid(value)) hold(value); }
        }
      }
      if (!value.held) finish(value);
      const message = value.held ? `${detail}，继续播放过渡画面，可重新选择画质或刷新` : `${detail}，已保留原播放选择`;
      report(message); publish('error', message); return false;
    } finally { request?.restore(); }
  }
  function run(operation: Operation) {
    if (stopped) return operation.action();
    if (active?.pending) return active.pending;
    const video = player.value.video, current = mainPlayback();
    if (!active?.held && (!canHandoffVideo(video) || !isMainPlayerReady() || current?.isAudio
      || current?.codec === 'rtc' || current?.player?.mediaHandle !== 'mse')) return operation.action();
    if (!active?.held) {
      const host = document.getElementById('js-player-video-first');
      const playerRoot = document.getElementById('js-player-main');
      if (!host || !video || !playerRoot) return operation.action();
      const cover = mountHandoffVideo(host), status = mountHandoffStatus(host);
      matchHandoffVideo(cover, video);
      active = { room: player.value.roomId, original: video, host, video: cover, abort: new AbortController(), shown: false, held: false, status, root: playerRoot };
    }
    const value = active!; value.held = false; value.isCurrent = operation.isCurrent;
    value.status.textContent = operation.message;
    positionHandoffStatus(value.host, value.status);
    value.root.dataset.guanyuSwitching = operation.refresh ? 'refresh' : '';
    value.pending = execute(value, operation).finally(() => {
      value.pending = undefined;
      if (active === value && value.held) {
        delete value.root.dataset.guanyuSwitching;
        value.status.textContent = operation.roomName ? `「${operation.roomName}」刷新未完成，继续播放当前画面` : '目标未就绪，当前画面继续播放，可重新选择或刷新';
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
    return run({ message: `正在切换到${line.name || '所选线路'}…`, action, rollback: () => restore?.(previous) });
  }
  function onPlayerClick(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('#js-player-controlbar i'), reload = native.reload;
    if (button && reload && !reload.props.inVod && !reload.props.isXukanMode && clickHandler(button) === reload.clickReload) {
      event.preventDefault(); event.stopImmediatePropagation();
      void run({ message: '正在刷新直播…', action: () => reload.clickReload(), refresh: true });
      return;
    }
    const item = event.target.closest('.menu-da2a9e li');
    if (!item || !native.codec?.menu?.contains(item) || !changeLine) return;
    const name = item.textContent?.trim().replace(/^✓\s*/, '');
    const line = cdnLines(native.quality).find(line => line.name === name);
    if (!line || line.cdn === native.quality.props.cdn) return;
    const handler = clickHandler(item);
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
        positionHandoffStatus(active.host, active.status);
        matchHandoffVideo(active.video, active.original);
        if (active.shown && native.playback?.props.isPlay === false) active.video.pause();
        else if (active.shown && active.video.paused && !active.video.ended) void active.video.play().catch(() => {});
      }
    }
    const next = document.getElementById('__h5player');
    if (root === next && boundQuality?.ratediv?.isConnected && boundCodec?._reactInternalFiber?.return && native.reload?.controlbar?.isConnected) return;
    if (root !== next) { bindings.forEach(restore => restore()); bindings.clear(); boundQuality = boundCodec = changeLine = undefined; root = next; }
    native = controls();
    if (native.quality && boundQuality !== native.quality) {
      const quality = native.quality; boundQuality = quality;
      bind(quality, 'onMultirateChange', (original, receiver, args) => {
        const previous = quality.props.multirates.find((item: any) => Number(item.type) === Number(quality.props.rate));
        return run({ message: `正在切换到${args[0]?.name || '所选画质'}…`, action: () => original.apply(receiver, args), rollback: () => original.call(receiver, previous ?? args[0]) });
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
        const label = args[0] === 'hevc' ? 'H.265' : args[0] === 'h264' ? 'H.264' : '自动编码';
        return run({ message: `正在切换到${label}…`, action: () => original.apply(receiver, args), rollback: () => original.call(receiver, previous) });
      });
    }
  }
  document.addEventListener('click', onPlayerClick, true);
  const stop = player.subscribe(sync), timer = setInterval(sync, 500);
  return {
    async refresh(action: () => Promise<void>, host: HTMLElement, roomName: string, isCurrent: () => boolean) {
      if (active?.pending) throw new Error('主画面正在交接，请稍后刷新');
      const message = `正在刷新「${roomName}」…`;
      const result = await run({ message, action: () => active ? action() : withHandoffStatus(host, message, action), refresh: true, roomName, isCurrent });
      if (result === false) throw new Error(`「${roomName}」刷新未完成，可再次刷新`);
    },
    dispose() { stopped = true; stop(); clearInterval(timer); document.removeEventListener('click', onPlayerClick, true); if (active) finish(active); bindings.forEach(restore => restore()); bindings.clear(); },
  };
}
