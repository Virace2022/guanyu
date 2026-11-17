import { mainPlayback } from './player-actions';
import type { MultiScreenNative } from './multiscreen';

export interface PlayerScreen {
  id: number;
  main: boolean;
  slot: HTMLElement;
  video: HTMLVideoElement | null;
  info: Record<string, any>;
  stats: Record<string, any>;
}

export function readPlayerScreen(native: MultiScreenNative, id?: number): PlayerScreen | null {
  const main = mainPlayback(), mainId = Number(main?.service?.constructor.baseParams?.rid || native.roomId);
  const roomId = id ?? mainId;
  if (!roomId || !mainId) return null;
  const active = !!native.core && native.active(), index = active ? native.order().indexOf(roomId) : roomId === mainId ? 0 : -1;
  if (index < 0) return null;
  const slot = active ? native.container?.children[index] as HTMLElement | undefined : document.getElementById('js-player-video-first');
  if (!slot?.isConnected) return null;
  const video = slot.querySelector<HTMLVideoElement>('video');
  if (roomId === mainId) return { id: roomId, main: true, slot, video, info: main?.player?.getMediaInfo?.() ?? {}, stats: main?.player?.getStatInfo?.() ?? {} };
  const component = native.component(slot, (value: any) => Number(value.props?.rid) === roomId && !!value.baseStream);
  const sdk = component?.baseStream?.player, stat = sdk?.getPlayerStat?.();
  return { id: roomId, main: false, slot, video, info: sdk?.mediaInfo ?? stat?.mediaInfo ?? {}, stats: stat?.statInfo ?? {} };
}

export function playerScreenAt(native: MultiScreenNative, x: number, y: number) {
  const ids = native.core && native.active() ? native.order() : [undefined];
  for (const id of ids) {
    const screen = readPlayerScreen(native, id);
    if (!screen) continue;
    const rect = screen.slot.getBoundingClientRect();
    if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) return screen;
  }
  return null;
}

export function closeNativePlayerMenu(native: MultiScreenNative) {
  const menu = native.component(document.querySelector('.menu-da2a9e:not(.subMenu-de1c61)'), (value: any) => typeof value.hideMenu === 'function');
  menu?.hideMenu({ which: 1, target: document.body });
}
