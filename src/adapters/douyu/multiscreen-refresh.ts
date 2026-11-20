import { GainAudio } from '../../features/volume-gain/audio';
import { readMultiscreenStream } from './multiscreen-rates';
import { alignRefreshedVideo, limitHandoff, matchHandoffVideo, mountHandoffStatus, mountHandoffVideo, positionHandoffStatus, waitForStandby, waitFrames } from './video-handoff';

interface StreamSelection { id: number; rate: number | null; line?: string }

export function mountSecondaryRefresh(slot: HTMLElement, original: HTMLVideoElement, roomName: string) {
  const abort = new AbortController(), signal = abort.signal;
  const video = mountHandoffVideo(original.parentElement!);
  const status = mountHandoffStatus(slot);
  const audio = new GainAudio(() => {});
  audio.setMedia(original, 100);
  let sdk: any, closeAudio: (() => void) | undefined;
  let shown = false, pending = false, watching = false;

  function dispose() {
    if (signal.aborted) return;
    abort.abort(new Error('分屏已变化，请重新选择'));
    closeAudio?.(); audio.dispose(); sdk?.dispose();
    video.remove(); status.remove(); delete slot.dataset.guanyuRefreshCover;
  }

  function sync() {
    if (signal.aborted) return;
    if (!slot.isConnected || !slot.contains(original) || !video.isConnected) { dispose(); return; }
    positionHandoffStatus(slot, status);
    matchHandoffVideo(video, original);
  }

  async function prepare(stream: any, selection: StreamSelection) {
    const player = stream.player, Player = Object.getPrototypeOf(player).constructor;
    let source: string = player.src;
    if (selection.rate !== null) {
      const data = await readMultiscreenStream(stream, selection.id, AbortSignal.any([signal, AbortSignal.timeout(10000)]), selection.rate, selection.line);
      if (!data.rtmp_url || !data.rtmp_live) throw new Error('当前线路未提供可播放的备用流');
      source = `${data.rtmp_url}/${data.rtmp_live}`;
    }
    signal.throwIfAborted();
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.includes('.flv')) throw new Error('当前线路暂不支持平滑刷新');
    sdk = new Player(url.href, { p2p: 0 });
    let failure: unknown;
    sdk.on('ERROR', () => { failure = new Error('备用直播流播放失败'); });
    sdk.attachMedia(video); sdk.load();
    void Promise.resolve(sdk.play()).catch(error => { failure = error; });
    await waitForStandby(video, original, () => { if (failure) throw failure; return !signal.aborted; }, signal);
    closeAudio = await limitHandoff(audio.handoff(video, signal), signal, 10000);
    signal.throwIfAborted();
    video.style.opacity = '1'; shown = true;
    slot.dataset.guanyuRefreshCover = '';
  }

  async function refresh(stream: any, selection: StreamSelection, reload: () => Promise<void>, ready: () => boolean) {
    pending = true;
    status.textContent = `正在刷新「${roomName}」…`;
    sync();
    try {
      signal.throwIfAborted();
      if (!shown) await prepare(stream, selection);
      await reload();
      await waitFrames(original, ready, signal, 10000);
      await alignRefreshedVideo(original, video, ready, signal);
      dispose();
    } catch (error) {
      if (!shown || signal.aborted) dispose();
      else {
        status.textContent = `「${roomName}」刷新未完成，继续播放当前画面`;
        if (!watching) {
          watching = true;
          void waitFrames(original, () => !pending && ready(), signal, 0).then(() => {
            if (!pending) dispose();
          }).catch(() => {}).finally(() => { watching = false; });
        }
      }
      throw error;
    } finally { pending = false; }
  }

  return { refresh, sync, dispose, get active() { return !signal.aborted; } };
}
