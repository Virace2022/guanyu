import type { PlayerScreen } from '../../adapters/douyu/player-screen';

export type VideoMetric = [string, string];
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
function codec(value: unknown, fallback: unknown) {
  const text = String(value ?? '');
  if (/hvc|hev/i.test(text) || Number(fallback) === 12) return 'H.265 / HEVC';
  if (/avc/i.test(text) || Number(fallback) === 7) return 'H.264 / AVC';
  if (/av01/i.test(text)) return 'AV1';
  if (/mp4a/i.test(text) || Number(fallback) === 10) return 'AAC';
  if (/opus/i.test(text)) return 'Opus';
  return text.match(/codecs\s*=\s*["']?([^;"']+)/i)?.[1] || '';
}

export function videoMetrics(screen: PlayerScreen | null, name: string, id?: number) {
  const specifications: VideoMetric[] = [], playback: VideoMetric[] = [];
  specifications.push(['直播间', name === `房间 ${id}` ? String(id) : id ? `${name}（${id}）` : name]);
  if (!screen) { playback.push(['画面状态', '该画面已不可用']); return { specifications, playback }; }
  const { info, stats, video, slot } = screen, metadata = info.metadata ?? {};
  const width = info.width || video?.videoWidth, height = info.height || video?.videoHeight;
  if (width && height) specifications.push(['画面分辨率', `${width} × ${height}`]);
  const fps = info.fps ?? metadata.framerate;
  if (fps) specifications.push(['直播帧率', `${fps} fps`]);
  const videoCodec = codec(info.videoMimeType, metadata.videocodecid), audioCodec = codec(info.audioMimeType, metadata.audiocodecid);
  if (videoCodec) specifications.push(['视频编码', videoCodec]);
  if (audioCodec) specifications.push(['音频编码', audioCodec]);
  for (const [label, value, unit] of [
    ['视频码率', info.videoDataRate ?? metadata.videodatarate, 'kbps'],
    ['音频码率', info.audioDataRate ?? metadata.audiodatarate, 'kbps'],
    ['音频采样率', info.audioSampleRate ?? metadata.audiosamplerate, 'Hz'],
    ['音频声道', info.audioChannelCount ?? metadata.audiochannels, ''],
  ] as const) if (value != null && Number.isFinite(Number(value))) specifications.push([label, `${value}${unit ? ` ${unit}` : ''}`]);
  if (metadata.encoder) specifications.push(['推流软件', String(metadata.encoder)]);
  playback.push(['画面区域', `${slot.clientWidth} × ${slot.clientHeight}`]);
  if (video) {
    playback.push(['播放状态', video.ended ? '已结束' : video.paused ? '已暂停' : video.readyState >= 3 ? '播放中' : '等待数据']);
    for (let i = 0; i < video.buffered.length; i++) if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) playback.push(['可播放缓冲', `${(video.buffered.end(i) - video.currentTime).toFixed(1)} 秒`]);
    const quality = video.getVideoPlaybackQuality?.(), decoded = quality?.totalVideoFrames ?? finite(stats.decodedFrames), dropped = quality?.droppedVideoFrames ?? finite(stats.droppedFrames);
    if (decoded !== undefined) playback.push(['已处理视频帧', String(decoded)]);
    if (dropped !== undefined) playback.push(['丢帧', String(dropped)]);
  }
  for (const [key, label] of [['loaderBytes', '已接收流量'], ['cdnBytes', 'CDN 流量'], ['p2pBytes', 'P2P 流量']]) {
    const value = finite(stats[key!]); if (value !== undefined) playback.push([label!, `${(value / 1048576).toFixed(2)} MiB`]);
  }
  return { specifications, playback };
}
