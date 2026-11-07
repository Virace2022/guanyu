import { TeamLiveStreamSource } from '../team-live/preview/stream-source';
import { loadFlv } from '../team-live/preview/libraries';

export async function readMetadata(id, signal) {
  const monitor = { valid: () => !signal.aborted }, tile = { id, token: 0, request: null };
  const sources = new TeamLiveStreamSource(monitor);
  const abort = () => tile.request?.abort(); signal.addEventListener('abort', abort);
  let player, video;
  try {
    const flv = await loadFlv();
    if (signal.aborted) throw new Error('已取消读取');
    const encryption = await sources.key(tile, 0), data = await sources.live(tile, 0, encryption, 1);
    if (signal.aborted) throw new Error('已取消读取');
    const url = sources.url(data);
    return await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => finish(new Error('读取主播配置超时')), 15000);
      const finish = (error, info) => { if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', cancelled); error ? reject(error) : resolve(info); };
      const cancelled = () => finish(new Error('已取消读取')); signal.addEventListener('abort', cancelled);
      video = document.createElement('video'); video.muted = true; video.volume = 0;
      player = flv.createPlayer({ type: 'flv', url, hasAudio: false, isLive: true }, { enableStashBuffer: false, fixAudioTimestampGap: false });
      player.on('media_info', info => finish(null, info)); player.on('error', () => finish(new Error('主播配置暂时无法读取')));
      player.attachMediaElement(video); player.load();
    });
  } finally { signal.removeEventListener('abort', abort); tile.request?.abort(); player?.destroy(); video?.removeAttribute('src'); video?.load(); }
}
