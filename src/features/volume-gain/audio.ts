import { diagnostics } from '../../core/diagnostics';

interface AudioRecord {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

// 同一媒体节点只能建立一次音频源；HMR 后继续复用，释放功能时恢复单位增益。
const records: WeakMap<HTMLMediaElement, AudioRecord> = import.meta.hot?.data.records ?? new WeakMap();
let sharedContext: AudioContext | null = import.meta.hot?.data.context ?? null;

if (import.meta.hot) {
  import.meta.hot.dispose(data => { data.records = records; data.context = sharedContext; });
}

export class GainAudio {
  private active: AudioRecord | null = null;
  private video: HTMLVideoElement | null = null;
  private amount = 100;
  private pending: Promise<void> | null = null;
  private released = false;

  constructor(private onStatus: (message: string) => void) {}

  setMedia(video: HTMLVideoElement | null, amount: number) {
    this.amount = amount;
    if (video !== this.video) {
      this.restore();
      this.active = null;
      this.video = video;
    }
    if (this.active) this.apply();
    else if (sharedContext?.state === 'running' && video && amount > 100) void this.activate();
  }

  private apply() {
    if (!this.active || !sharedContext) return;
    const parameter = this.active.gain.gain;
    parameter.cancelScheduledValues(sharedContext.currentTime);
    parameter.setTargetAtTime(this.amount / 100, sharedContext.currentTime, 0.02);
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
      let record = records.get(video);
      if (!record) {
        const source = sharedContext.createMediaElementSource(video);
        const gain = sharedContext.createGain();
        source.connect(gain);
        gain.connect(sharedContext.destination);
        record = { source, gain };
        records.set(video, record);
      }
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
    this.restore();
    this.active = null;
    this.video = null;
  }
}
