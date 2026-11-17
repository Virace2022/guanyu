import type { MultiScreenNative } from '../../adapters/douyu/multiscreen';
import { closeNativePlayerMenu, playerScreenAt, readPlayerScreen } from '../../adapters/douyu/player-screen';
import type { RoomData } from '../../adapters/douyu/rooms';
import styles from '../../ui/player-screen.css?style';
import { mountNativeVideoInfo } from '../../adapters/douyu/video-info';

export function createScreens(getNative: () => MultiScreenNative, room: (id: number) => RoomData | undefined) {
  let target: number | undefined;
  let returnFocus: HTMLElement | undefined;
  const mirrors = new Set<number>(), videos = new Map<HTMLVideoElement, string | null>();
  const sheet = styles.cloneNode(true); document.head.append(sheet);
  function current() { return readPlayerScreen(getNative(), target); }
  const stopInfo = mountNativeVideoInfo(getNative, { selected: () => current()?.id, read: id => readPlayerScreen(getNative(), id), name: id => room(id)?.nn || `房间 ${id}` });
  function sync() {
    const native = getNative(), ids = native.core && native.active() ? native.order() : [undefined];
    const alive = new Set<HTMLVideoElement>();
    for (const id of ids) {
      const screen = readPlayerScreen(native, id), video = screen?.video;
      if (!screen || !video) continue;
      alive.add(video);
      if (!videos.has(video)) videos.set(video, video.getAttribute('data-guanyu-mirrored'));
      const value = String(mirrors.has(screen.id));
      if (video.getAttribute('data-guanyu-mirrored') !== value) video.setAttribute('data-guanyu-mirrored', value);
    }
    for (const [video, previous] of videos) if (!alive.has(video)) { restore(video, previous); videos.delete(video); }
  }
  function restore(video: HTMLVideoElement, value: string | null) {
    if (value === null) video.removeAttribute('data-guanyu-mirrored'); else video.setAttribute('data-guanyu-mirrored', value);
  }
  const timer = setInterval(sync, 500);
  return {
    current,
    name() { const value = current(); return value ? room(value.id)?.nn || `房间 ${value.id}` : '画面已变化'; },
    capture(event: MouseEvent) {
      const node = event.target instanceof Element ? event.target : null;
      if (!node?.closest('#js-player-video-case') || node.closest('.menu-da2a9e, [class*="mutiPlayerEditPanel-"], #js-player-controlbar')) return false;
      const label = node.closest<HTMLElement>('[data-guanyu-audio-room]');
      const screen = label ? readPlayerScreen(getNative(), Number(label.dataset.guanyuAudioRoom)) : playerScreenAt(getNative(), event.clientX, event.clientY);
      if (!screen) return false;
      target = screen.id; returnFocus = undefined; return true;
    },
    open(id: number, anchor: HTMLElement, x: number, y: number, keyboard = false) {
      target = id;
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y });
      anchor.dispatchEvent(event);
      returnFocus = keyboard ? anchor.querySelector<HTMLElement>('button') ?? anchor : undefined;
      if (keyboard) requestAnimationFrame(() => document.querySelector<HTMLElement>('.menu-da2a9e [data-guanyu-action]:not([aria-disabled="true"])')?.focus());
    },
    closeMenu() { closeNativePlayerMenu(getNative()); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); returnFocus = undefined; },
    isMulti() { const native = getNative(); return !!native.core && native.active(); },
    mirrored() { const value = current(); return !!value && mirrors.has(value.id); },
    toggleMirror() {
      const value = current(); if (!value) throw new Error('画面已变化，请重新右键选择');
      if (mirrors.has(value.id)) mirrors.delete(value.id); else mirrors.add(value.id);
      sync();
    },
    sync,
    dispose() { stopInfo(); clearInterval(timer); for (const [video, previous] of videos) restore(video, previous); videos.clear(); mirrors.clear(); sheet.parentNode?.removeChild(sheet); },
  };
}
export type ScreenController = ReturnType<typeof createScreens>;
