import type { RoomData } from './rooms';

export function roomSearchTerm(input: string) {
  const value = input.trim();
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (/(^|\.)douyu\.com$/i.test(url.hostname)) return url.pathname.match(/^\/(\d+)\/?$/)?.[1]
      || (url.pathname.startsWith('/topic/') ? url.searchParams.get('rid') : null) || value;
  } catch {}
  return value;
}

export async function searchLiveRooms(input: string, page: number, request: (url: string) => Promise<any>) {
  const kw = roomSearchTerm(input);
  const result = await request(`/japi/search/api/searchUser?${new URLSearchParams({ kw, page: String(page), pageSize: '28', filterType: '0' })}`);
  if (Number(result.error) !== 0 || !Array.isArray(result.data?.relateUser)) throw new Error(result.msg || '斗鱼搜索暂时不可用，请重试');
  const rooms: RoomData[] = result.data.relateUser.flatMap((item: any) => {
    const room = item.anchorInfo;
    if (!room || Number(room.isLive) !== 1 || Number(room.isLoop) === 1 || Number(room.videoLoop) === 1 || !Number.isSafeInteger(Number(room.rid)) || Number(room.rid) <= 0) return [];
    return [{ rid: Number(room.rid), nn: String(room.nickName), avt: room.avatar || '', roomSrcSixteen: room.roomSrc || '', hot: '0', showStatus: '1' }];
  });
  return { rooms, more: page * Number(result.data.pageSize || 28) < Number(result.data.total || 0) };
}

export async function requireLiveRoom(id: number, request: (url: string) => Promise<any>) {
  const result = await request(`/betard/${id}`);
  if (Number(result.room?.show_status) !== 1 || Number(result.room?.videoLoop) === 1) throw new Error('这个房间没有正在直播，请从设置或团播名单添加。');
}
