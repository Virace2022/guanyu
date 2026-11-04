export interface RoomData { rid: number; nn: string; avt: string; roomSrcSixteen: string; hot: string; showStatus: string }
interface RoomInfo { RoomID: string | number; NickName: string; AvatarSMall?: string; Avatar?: string; RoomSrcSixteen?: string; Hot?: number; ShowStatus?: number }

export class RoomApi {
  private requests = new Set<AbortController>();
  async request<T>(url: string): Promise<T> {
    const abort = new AbortController(); this.requests.add(abort);
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(url, { credentials: 'include', signal: abort.signal });
      if (!response.ok) throw new Error(`房间资料请求失败（HTTP ${response.status}）`);
      return await response.json() as T;
    } finally { clearTimeout(timer); this.requests.delete(abort); }
  }
  async info(ids: (number | string)[]) {
    const unique = [...new Set(ids.map(Number))].filter(id => Number.isSafeInteger(id) && id > 0), rooms: RoomData[] = [];
    for (let index = 0; index < unique.length; index += 50) {
      const result = await this.request<{ error: number; data: RoomInfo[] }>(`/japi/carnival/c/roomInfo/getRoomInfo?roomIds=${unique.slice(index, index + 50).join(',')}`);
      if (result.error !== 0 || !Array.isArray(result.data)) throw new Error('未能取得直播间资料');
      for (const room of result.data) rooms.push({ rid: Number(room.RoomID), nn: room.NickName, avt: room.AvatarSMall || room.Avatar || '',
        roomSrcSixteen: room.RoomSrcSixteen || '', hot: String(room.Hot || 0), showStatus: Number(room.ShowStatus) === 1 ? '1' : '2' });
    }
    return rooms;
  }
  async resolve(input: string) {
    let value = input.trim();
    if (!/^\d+$/.test(value)) {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!/(^|\.)douyu\.com$/i.test(url.hostname)) throw new Error('请输入斗鱼房间号或直播间链接');
      value = url.pathname.match(/^\/(\d+)\/?$/)?.[1] || (url.pathname.startsWith('/topic/') && url.searchParams.get('rid')) || '';
    }
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('房间号无效');
    const rooms = await this.info([value]);
    if (rooms.length !== 1) throw new Error('没有找到这个直播间');
    return rooms[0]!;
  }
  close() { for (const request of this.requests) request.abort(); this.requests.clear(); }
}
