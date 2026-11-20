import './playback-handoff.css';

export function mountHandoffStatus(host: HTMLElement, message = '') {
  const status = document.createElement('div');
  status.className = 'guanyu-playback-switch';
  status.setAttribute('role', 'status');
  status.textContent = message;
  host.append(status);
  positionHandoffStatus(host, status);
  return status;
}

export async function withHandoffStatus(host: HTMLElement, message: string, action: () => Promise<void>) {
  const status = mountHandoffStatus(host, message);
  try { await action(); }
  finally { status.remove(); }
}

export function canHandoffVideo(video: HTMLVideoElement | null | undefined): video is HTMLVideoElement {
  return !!video && !video.paused && !video.seeking && !video.ended && !video.error && video.videoWidth > 0
    && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && typeof video.requestVideoFrameCallback === 'function';
}

export function limitHandoff<T>(promise: Promise<T>, signal: AbortSignal, timeout: number) {
  return new Promise<T>((resolve, reject) => {
    const finish = (callback: () => void) => { clearTimeout(timer); signal.removeEventListener('abort', abort); callback(); };
    const abort = () => finish(() => reject(signal.reason ?? new Error('交接已取消')));
    const timer = setTimeout(() => finish(() => reject(new Error('准备过渡直播流超时'))), timeout);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

export function positionHandoffStatus(host: HTMLElement, status: HTMLElement) {
  const rect = host.getBoundingClientRect();
  status.style.top = `${Math.max(0, -rect.top) + 12}px`;
  status.style.left = `${Math.max(0, -rect.left) + 12}px`;
}

export function mountHandoffVideo(host: HTMLElement) {
  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  video.dataset.guanyuHandoff = '';
  host.append(video);
  return video;
}

export function matchHandoffVideo(video: HTMLVideoElement, original: HTMLVideoElement) {
  const style = getComputedStyle(original);
  video.style.objectFit = style.objectFit;
  video.style.transform = style.transform;
  video.style.scale = style.scale;
}

function seekBuffered(video: HTMLVideoElement, time: number) {
  const ranges = video.buffered;
  for (let index = 0; index < ranges.length; index++) {
    if (time >= ranges.start(index) && time < ranges.end(index) - 0.1) {
      video.currentTime = time;
      return true;
    }
  }
  return false;
}

export function waitFrames(video: HTMLVideoElement, ready: () => boolean, signal: AbortSignal, timeout: number) {
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

export async function waitForStandby(video: HTMLVideoElement, original: HTMLVideoElement, ready: () => boolean, signal: AbortSignal) {
  await waitFrames(video, ready, signal, 10000);
  let failure: unknown;
  await waitFrames(video, () => {
    if (failure) throw failure;
    if (!ready()) return false;
    const target = original.currentTime;
    if (Math.abs(target - video.currentTime) <= 0.12) return true;
    if (seekBuffered(video, target)) {
      if (video.paused) void video.play().catch(error => { failure = error; });
      return false;
    }
    if (video.currentTime > target) video.pause();
    return false;
  }, signal, 10000);
}

export async function alignRefreshedVideo(original: HTMLVideoElement, cover: HTMLVideoElement, ready: () => boolean, signal: AbortSignal) {
  if (Math.abs(cover.currentTime - original.currentTime) <= 0.12) return;
  let aligned = seekBuffered(original, cover.currentTime);
  if (!aligned) {
    const lead = original.buffered.length ? original.buffered.start(0) - cover.currentTime : 0;
    if (lead <= 0 || lead > 2) return;
  }
  const deadline = performance.now() + 2500;
  await waitFrames(original, () => {
    if (!ready()) return false;
    if (!aligned && performance.now() < deadline && canHandoffVideo(cover)) {
      aligned = seekBuffered(original, cover.currentTime);
      return false;
    }
    return !original.seeking;
  }, signal, 4000);
}
