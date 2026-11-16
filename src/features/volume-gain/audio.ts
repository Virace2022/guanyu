import { diagnostics } from '../../core/diagnostics';

interface AudioRecord {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  output: GainNode;
}

// 同一媒体节点只能建立一次音频源；HMR 后继续复用，释放功能时恢复单位增益。
const records: WeakMap<HTMLMediaElement, AudioRecord> = import.meta.hot?.data.records ?? new WeakMap();
let sharedContext: AudioContext | null = import.meta.hot?.data.context ?? null;

function connectRecord(video: HTMLMediaElement, output = 1): AudioRecord {
  const context = sharedContext!;
  let record = records.get(video);
  if (!record) {
    const source = context.createMediaElementSource(video), gain = context.createGain(), gate = context.createGain();
    gate.gain.value = output;
    source.connect(gain); gain.connect(gate); gate.connect(context.destination);
    record = { source, gain, output: gate }; records.set(video, record);
  } else if (!record.output) {
    // HMR 复用旧资源时，在既有增益后补上独立输出门，不重建媒体音频源。
    record.output = context.createGain(); record.output.gain.value = output;
    record.gain.disconnect(); record.gain.connect(record.output); record.output.connect(context.destination);
  }
  return record;
}

if (import.meta.hot) {
  import.meta.hot.dispose(data => { data.records = records; data.context = sharedContext; });
}

export class GainAudio {
  private active: AudioRecord | null = null;
  private video: HTMLVideoElement | null = null;
  private amount = 100;
  private pending: Promise<void> | null = null;
  private released = false;
  private bridge: { record: AudioRecord; dispose(): void } | null = null;

  constructor(private onStatus: (message: string) => void) {}

  setMedia(video: HTMLVideoElement | null, amount: number) {
    this.amount = amount;
    if (video !== this.video) {
      this.bridge?.dispose();
      this.restore();
      this.active = null;
      this.video = video;
    }
    if (this.active || this.bridge) this.apply();
    else if (sharedContext?.state === 'running' && video && amount > 100) void this.activate();
  }

  private apply() {
    if (!sharedContext) return;
    for (const record of [this.active, this.bridge?.record]) {
      if (!record) continue;
      record.gain.gain.cancelScheduledValues(sharedContext.currentTime);
      record.gain.gain.setTargetAtTime(this.amount / 100, sharedContext.currentTime, 0.02);
    }
  }

  async handoff(video: HTMLVideoElement, signal: AbortSignal): Promise<() => void> {
    const original = this.video;
    if (!original || original === video || signal.aborted) throw new Error('主画面已变化，取消声音交接');
    const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!;
    const muted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted')!;
    const audible = () => !muted.get!.call(original) && volume.get!.call(original) > 0;
    if (!this.active && sharedContext?.state !== 'running' && !audible()) {
      // 零音量启动时浏览器可能禁止 Web Audio；先交接画面，用户打开声音后再接管输出。
      let disposed = false, pending = false, release: (() => void) | undefined;
      const sync = () => {
        if (disposed || pending || !audible()) return;
        pending = true;
        void this.handoff(video, signal).then(stop => { if (disposed) stop(); else release = stop; }).catch(error => {
          pending = false;
          if (!signal.aborted) diagnostics.report('gain.audio', 'error', `声音交接未完成：${String(error)}`, '交接');
        });
      };
      original.addEventListener('volumechange', sync);
      return () => { disposed = true; original.removeEventListener('volumechange', sync); release?.(); };
    }
    sharedContext ??= new AudioContext();
    const context = sharedContext;
    if (context.state !== 'running') {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new Error('声音交接已取消'));
        signal.addEventListener('abort', abort, { once: true });
        context.resume().then(() => { signal.removeEventListener('abort', abort); resolve(); }, error => { signal.removeEventListener('abort', abort); reject(error); });
      });
    }
    if (this.released || signal.aborted || this.video !== original || !video.isConnected) throw new Error('主画面已变化，取消声音交接');
    if (context.state !== 'running') throw new Error('声音交接需要先点击播放器以允许播放');
    this.bridge?.dispose();
    const source = connectRecord(original), target = connectRecord(video, 0);
    const sync = () => {
      video.volume = volume.get!.call(original);
      video.muted = muted.get!.call(original);
    };
    let disposed = false;
    const dispose = () => {
      if (disposed) return; disposed = true;
      // 两路输出使用同一音频时钟交接，不改原生音量与多屏媒体属性。
      source.output.gain.setValueAtTime(1, context.currentTime);
      target.output.gain.setValueAtTime(0, context.currentTime);
      video.muted = true;
      original.removeEventListener('volumechange', sync);
      target.source.disconnect(); target.gain.disconnect(); target.output.disconnect(); records.delete(video);
      if (this.bridge?.record === target) this.bridge = null;
    };
    this.bridge = { record: target, dispose };
    this.active = source; this.apply(); sync();
    original.addEventListener('volumechange', sync);
    source.output.gain.setValueAtTime(0, context.currentTime);
    target.output.gain.setValueAtTime(1, context.currentTime);
    return dispose;
  }

  activate() {
    if (this.pending) return this.pending;
    this.pending = this.connect().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async connect() {
    try {
      if (!this.video) { diagnostics.report('gain.audio', 'waiting', '尚未取得主媒体 video'); this.onStatus('等待播放器加载'); return; }
      sharedContext ??= new AudioContext();
      // 先恢复上下文再接管媒体，避免自动播放限制使原声静音。
      if (sharedContext.state !== 'running') await sharedContext.resume();
      if (this.released) return;
      if (sharedContext.state !== 'running') { diagnostics.report('gain.audio', 'waiting', 'AudioContext 尚未运行，等待用户手势'); this.onStatus('点击开启增益'); return; }
      const video = this.video;
      if (!video?.isConnected) return;
      if (video.currentSrc) {
        const url = new URL(video.currentSrc, location.href);
        if (/^https?:$/.test(url.protocol) && url.origin !== location.origin && !video.crossOrigin) {
          diagnostics.report('gain.audio', 'idle', '当前媒体为跨源线路且未设置 crossOrigin，不能接入 Web Audio');
          this.onStatus('当前播放线路暂不支持增益'); return;
        }
      }
      const record = connectRecord(video);
      if (record !== this.active) { this.restore(); this.active = record; }
      this.apply();
      diagnostics.report('gain.audio', 'applied', '已连接主媒体 Web Audio 音频源与 GainNode');
      this.onStatus(this.amount > 100 ? '增益已启用，仅记住当前房间' : '已恢复原声');
    } catch (error) {
      diagnostics.report('gain.audio', 'error', error instanceof Error ? error.message : String(error));
      this.onStatus('增益未能启用，请刷新后重试');
    }
  }

  private restore() {
    if (!this.active || !sharedContext) return;
    this.active.gain.gain.cancelScheduledValues(sharedContext.currentTime);
    this.active.gain.gain.setValueAtTime(1, sharedContext.currentTime);
  }

  dispose() {
    this.released = true;
    this.bridge?.dispose();
    this.restore();
    this.active = null;
    this.video = null;
  }
}
