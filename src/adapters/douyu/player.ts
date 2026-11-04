import { createState } from '../../core/state';

interface DouyuPage {
  room_id?: string | number;
  $ROOM?: { room_id?: string | number };
}

export interface PlayerState {
  roomId: string | null;
  video: HTMLVideoElement | null;
  volume: Element | null;
}

function roomNumber(value: unknown): string | null {
  const number = String(value ?? '').trim();
  return /^[1-9]\d*$/.test(number) ? number : null;
}

function broadcastRoom(): string | null {
  const source = document.getElementById('broadcast-jsonld')?.textContent;
  if (!source) return null;
  try {
    const url = JSON.parse(source).workPerformed?.contentUrl;
    return typeof url === 'string' ? roomNumber(new URL(url, location.href).pathname.slice(1)) : null;
  } catch { return null; }
}

export function observePlayer(page: Window & DouyuPage) {
  const state = createState<PlayerState>({ roomId: null, video: null, volume: null });
  let watchedRoot: Element | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    if (pending !== undefined) return;
    pending = setTimeout(() => { pending = undefined; refresh(); }, 150);
  });

  function refresh() {
    const root = document.querySelector('#room-html5-player');
    const controls = document.querySelector('#js-player-controlbar') ?? root;
    const video = document.querySelector<HTMLVideoElement>('#js-player-video-first video')
      ?? document.querySelector<HTMLVideoElement>('.layout-Player-videoEntity video')
      ?? root?.querySelector('video') ?? null;
    const volume = controls?.querySelector('[class*="VolumeBar-"]')?.parentElement
      ?? controls?.querySelector('.volume-07c230') ?? null;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
    const roomId = roomNumber(page.room_id) ?? roomNumber(page.$ROOM?.room_id)
      ?? broadcastRoom()
      ?? (canonical ? roomNumber(new URL(canonical, location.href).pathname.slice(1)) : null)
      ?? (video ? roomNumber(location.pathname.slice(1)) : null);
    const next = { roomId, video, volume };
    if (Object.keys(next).some(key => next[key as keyof PlayerState] !== state.value[key as keyof PlayerState])) {
      state.set(next);
    }
    const watch = document.querySelector('#js-player-main');
    if (watch !== watchedRoot) {
      observer.disconnect();
      if (watch) observer.observe(watch, { childList: true, subtree: true });
      watchedRoot = watch;
    }
  }

  refresh();
  const timer = setInterval(refresh, 1000);
  return {
    ...state,
    get value() { return state.value; },
    dispose() { clearInterval(timer); clearTimeout(pending); observer.disconnect(); },
  };
}

export type PlayerStore = ReturnType<typeof observePlayer>;

export function isPlayerFullscreen() {
  return !!document.fullscreenElement || document.body.classList.contains('is-fullScreenPage')
    || document.body.classList.contains('is-fullScreen') || !!document.querySelector('.wfs-2a8e83.removed-9d4c42, .toggle__P8TKM');
}
