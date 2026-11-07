import type { MultiAudio } from '../../features/multiscreen/audio';
import type { MultiScreenNative } from './multiscreen';

const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!;
const muted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted')!;
interface Media { video: HTMLVideoElement; id: number; main: boolean; restore: () => void }

export function mountMultiscreenAudio(getNative: () => MultiScreenNative, audio: MultiAudio) {
  const media = new Map<HTMLVideoElement, Media>();
  let enabled = true, connected = false, syncing = false, frame = 0, native: MultiScreenNative | null = null;
  let container: HTMLElement | null = null, unsubscribe: (() => void) | undefined, nativeVolume = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  const observer = new MutationObserver(schedule);
  function writeMedia(record: Media) {
    const amount = audio.output(record.id);
    if (volume.get!.call(record.video) !== amount) volume.set!.call(record.video, amount);
    if (muted.get!.call(record.video) !== (amount === 0)) muted.set!.call(record.video, amount === 0);
  }
  function bindMedia(video: HTMLVideoElement, id: number, main: boolean) {
    const ownVolume = Object.getOwnPropertyDescriptor(video, 'volume'), ownMuted = Object.getOwnPropertyDescriptor(video, 'muted');
    const record: Media = { video, id, main, restore() {
      if (ownVolume) Object.defineProperty(video, 'volume', ownVolume); else delete (video as Partial<HTMLVideoElement>).volume;
      if (ownMuted) Object.defineProperty(video, 'muted', ownMuted); else delete (video as Partial<HTMLVideoElement>).muted;
      volume.set!.call(video, main && !audio.value.muted ? audio.value.master : 0);
      muted.set!.call(video, main ? audio.value.muted : true);
    } };
    // 主视频向官方服务呈现底部音量，实际输出经原生属性写入，避免 SDK 回读后重复乘比例。
    Object.defineProperties(video, {
      volume: { configurable: true, get: () => main ? audio.value.muted ? 0 : audio.value.master : volume.get!.call(video), set: (value: number) => {
        if (main && !(value === 0 && audio.value.muted)) audio.setMaster(value); else writeMedia(record);
      } },
      muted: { configurable: true, get: () => main ? audio.value.muted : muted.get!.call(video), set: (value: boolean) => {
        if (main && (value || nativeVolume > 0)) audio.setMuted(!!value); else writeMedia(record);
      } },
    });
    media.set(video, record); writeMedia(record);
  }
  function paint() {
    if (!connected || !native) return;
    for (const record of media.values()) writeMedia(record);
    const master = audio.value.muted ? 0 : audio.value.master;
    if (nativeVolume !== master) {
      nativeVolume = master; native.control.actions.call({ id: 'videoModule', action: 'changeVolume', data: [master] });
    }
  }
  function detach() {
    if (!connected) return;
    connected = false; observer.disconnect(); unsubscribe?.(); unsubscribe = undefined;
    for (const record of media.values()) record.restore(); media.clear();
    native = null; container = null; audio.disconnect();
  }
  function sync() {
    frame = 0; if (syncing) return; syncing = true;
    try {
      const current = getNative();
      if (!enabled || !current.service || !current.core || !current.active() || !current.container?.isConnected) { detach(); return; }
      const ids = current.order(); if (ids.length < 2) { detach(); return; }
      if (native && (native !== current || container !== current.container)) detach();
      if (current.service.$dragBox) return;
      const host = current.container as HTMLElement;
      const main = [...media.values()].find(record => record.main && record.video.isConnected)?.video
        ?? host.querySelector<HTMLVideoElement>('#js-player-video-first video') ?? host.querySelector<HTMLVideoElement>('.layout-Player-videoEntity video');
      if (!main) return;
      if (!connected) {
        native = current; container = host; nativeVolume = Number(current.store.getState().getIn(['videoModule', 'player', 'volume'])) || 0;
        audio.connect(ids, current.roomId, nativeVolume, muted.get!.call(main)); connected = true;
        observer.observe(host, { subtree: true, childList: true });
        unsubscribe = current.store.subscribe(() => {
          const next = Number(current.store.getState().getIn(['videoModule', 'player', 'volume'])) || 0;
          if (next !== nativeVolume) { nativeVolume = next; audio.setMaster(next); } schedule();
        });
      } else audio.connect(ids, current.roomId, audio.value.master, audio.value.muted);
      const live = new Set<HTMLVideoElement>();
      for (const [index, slot] of [...host.children].slice(0, ids.length).entries()) {
        const video = slot.querySelector<HTMLVideoElement>('video'), id = ids[index]; if (!video) continue;
        live.add(video);
        if (media.get(video)?.id !== id) { media.get(video)?.restore(); media.delete(video); }
        if (!media.has(video)) bindMedia(video, id, id === current.roomId);
      }
      for (const [video, record] of media) if (!live.has(video)) { record.restore(); media.delete(video); }
      paint();
    } finally { syncing = false; }
  }
  const stop = audio.subscribe(paint), timer = setInterval(sync, 500);
  return {
    apply(options: { enabled: boolean; independentVolume: boolean }) { enabled = options.enabled; audio.configure(options.independentVolume); sync(); },
    dispose() { clearInterval(timer); cancelAnimationFrame(frame); detach(); stop(); },
  };
}
