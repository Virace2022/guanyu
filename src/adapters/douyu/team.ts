import { createState } from '../../core/state';
import { teamCardElements } from './team-card-preview';

interface LiveIcon { icon: string; top?: string; right?: string }

export interface TeamRoom {
  id: string;
  name: string;
  href: string;
  target: string;
  avatar: string;
  live: boolean;
  element: HTMLElement;
  decoration: HTMLElement;
  liveIcon?: LiveIcon;
}

export interface TeamSource {
  activity: string;
  pageId: string | null;
  native: HTMLElement;
  rooms: TeamRoom[];
  streamPromotion: boolean;
  liveIcon?: LiveIcon;
}

interface RoomInfo {
  RoomID?: string | number;
  NickName?: string;
  ShowStatus?: number;
  Avatar?: string;
  AvatarMid?: string;
}

interface NativeProps {
  roomInfo?: RoomInfo;
  service?: { pageId?: string | number };
  liveIcon?: LiveIcon;
  children?: { props?: { cmpprops?: { liveIcon?: LiveIcon } } }[];
}

interface Fiber {
  return?: Fiber;
  alternate?: Fiber;
  memoizedProps?: NativeProps;
  stateNode?: { props?: NativeProps; current?: Fiber };
}

function findProps(node: HTMLElement, accepts: (props: NativeProps) => boolean) {
  const key = Object.keys(node).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
  let current = key ? (node as unknown as Record<string, Fiber>)[key] : undefined;
  let root = current;
  while (root?.return) root = root.return;
  // DOM 可能仍关联旧树，异步名单要从 React 已提交的分支读取。
  if (root?.stateNode?.current === root?.alternate && current?.alternate) current = current.alternate;
  for (let fiber = current, depth = 0; fiber && depth < 30; fiber = fiber.return, depth++) {
    const props = fiber.stateNode?.props ?? fiber.memoizedProps;
    if (props && accepts(props)) return props;
  }
  return null;
}

function findSource(page: Window & { zhtId?: string | number }): TeamSource | null {
  for (const native of document.querySelectorAll<HTMLElement>('.wm-pc-switchroom, .room-info')) {
    const roomInfo = native.matches('.room-info');
    const rooms = new Map<string, TeamRoom>();
    for (const element of teamCardElements(native, roomInfo ? '.room-info-btn' : '.wm-pc-room-button')) {
      const props = roomInfo ? findProps(element, props => !!props.roomInfo?.RoomID) : null;
      const info = props?.roomInfo;
      const anchor = element.closest<HTMLAnchorElement>('a[href]');
      if (roomInfo ? !info : !anchor) continue;
      let url: URL;
      try { url = new URL(info ? `https://www.douyu.com/${info.RoomID}` : anchor!.href, location.href); }
      catch { continue; }
      const id = url.pathname.match(/^\/(\d+)\/?$/)?.[1]
        ?? (url.pathname.startsWith('/topic/') ? url.searchParams.get('rid') : null);
      if (!id || !/^[1-9]\d*$/.test(id) || !/(^|\.)douyu\.com$/.test(url.hostname)) continue;
      rooms.set(id, {
        id, href: url.href, target: anchor?.target ?? '', element, decoration: roomInfo ? element.parentElement! : element, liveIcon: props?.liveIcon,
        name: element.querySelector('.wm-pc-room-button-text, .room-info-text')?.textContent?.trim() || info?.NickName || id,
        avatar: info?.AvatarMid || info?.Avatar || '',
        live: info ? Number(info.ShowStatus) === 1 : !!element.querySelector('img[alt="直播中"], img.room-info-live'),
      });
    }
    if (!rooms.size) continue;
    const props = findProps(native, props => !!props.service?.pageId);
    const id = props?.service?.pageId ?? page.zhtId;
    const liveIcon = [...rooms.values()].map(room => room.liveIcon).find(Boolean)
      ?? props?.children?.map(child => child?.props?.cmpprops?.liveIcon).find(icon => /^https?:\/\//.test(icon?.icon ?? ''));
    const pageId = /^\d+$/.test(String(id)) ? String(id) : null;
    // 只排除有明确主 / 副舞台纯净流标识的赛事切流，其他同模板活动保持宽泛识别。
    const names = [...rooms.values()].map(room => room.name);
    const streamPromotion = names.some(name => /主舞台.*纯净流/.test(name)) && names.some(name => /副舞台.*纯净流/.test(name));
    return { native, pageId, rooms: [...rooms.values()], streamPromotion, liveIcon,
      activity: pageId ? `page-${pageId}` : `rooms-${[...rooms.keys()].sort().join('-')}` };
  }
  return null;
}

export function observeTeam(page: Window & { zhtId?: string | number }) {
  const state = createState<TeamSource | null>(null);
  let signature = '';
  let watched: HTMLElement | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(refresh, 200);
  });

  function refresh() {
    const next = findSource(page);
    const key = next ? `${next.activity}|${next.rooms.map(room => `${room.id}:${room.name}:${room.live}:${room.avatar}`).join('|')}` : '';
    const nodesChanged = next?.native !== state.value?.native
      || next?.rooms.some((room, index) => room.element !== state.value?.rooms[index]?.element);
    if (key !== signature || nodesChanged) { signature = key; state.set(next); }
    if (next?.native !== watched) {
      observer.disconnect();
      watched = next?.native ?? null;
      if (watched) observer.observe(watched, { childList: true, subtree: true, characterData: true });
    }
  }

  refresh();
  const timer = setInterval(refresh, 1500);
  return { subscribe: state.subscribe, get value() { return state.value; }, refresh,
    dispose() { clearInterval(timer); clearTimeout(pending); observer.disconnect(); } };
}

export type TeamSourceStore = ReturnType<typeof observeTeam>;
