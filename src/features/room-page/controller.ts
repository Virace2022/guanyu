import type { SettingsStore } from '../../config/settings';
import type { PlayerStore } from '../../adapters/douyu/player';
import { mountRoomPage } from '../../adapters/douyu/room-page';
import { RoomApi } from '../../adapters/douyu/rooms';
import { createState } from '../../core/state';
import { unsafeWindow } from '$';
import { diagnostics } from '../../core/diagnostics';

export function createRoomPage(settings: SettingsStore, player: PlayerStore) {
  const view = createState<{ error: string; roomId: string | null; live: boolean | null }>({ error: '', roomId: null, live: null }), dom = mountRoomPage(), api = new RoomApi();
  let room = '', stopped = false, busy = false, nextAt = 0;
  async function refresh() {
    const id = player.value.roomId;
    if (!id || stopped || busy || !(settings.value.playback.autoWebFullscreen || Object.entries(settings.value.room).some(([key, value]) => ['duration', 'guild', 'lastLive'].includes(key) && value))) return;
    busy = true;
    try {
      const result = await api.request<any>(`/betard/${id}`);
      if (stopped || player.value.roomId !== id) return;
      if (!result.room) throw new Error('房间信息格式异常');
      const data = result.room;
      const page = unsafeWindow as Window & { $ROOM?: { room_id?: string | number; clubOrgName?: string } };
      const guild = !page.$ROOM?.room_id || String(page.$ROOM.room_id) === id ? page.$ROOM?.clubOrgName ?? data.room_biz_all?.clubOrgName : data.room_biz_all?.clubOrgName;
      const live = Number(data.show_status) === 1 && Number(data.videoLoop) !== 1;
      dom.update({ live, start: Number(data.show_time) * 1000,
        now: Number(data.nowtime) * 1000 || Date.now(), received: Date.now(), guild: String(guild || '').trim() });
      view.set({ error: '', roomId: id, live });
      diagnostics.report('room.api', 'ready', '/betard/<房间号> 已返回有效房间资料', '接口');
    } catch (cause) { if (!stopped && player.value.roomId === id) { diagnostics.report('room.api', 'error', `/betard/<房间号>：${cause instanceof Error ? cause.message : String(cause)}`, '接口'); dom.update(); view.set({ error: cause instanceof Error ? cause.message : String(cause), roomId: id, live: null }); } }
    finally { busy = false; nextAt = player.value.roomId === id ? Date.now() + 60000 : 0; }
  }
  const stopPlayer = player.subscribe(value => { if (room !== value.roomId) { room = value.roomId || ''; nextAt = 0; api.close(); dom.update(); view.set({ error: '', roomId: value.roomId, live: null }); void refresh(); } });
  const stopSettings = settings.subscribe(value => { dom.apply(value.room); if (Date.now() >= nextAt) void refresh(); });
  const timer = setInterval(() => { if (!document.hidden && Date.now() >= nextAt) void refresh(); }, 1000);
  return { ...view, get value() { return view.value; }, refresh, dispose() { stopped = true; stopPlayer(); stopSettings(); clearInterval(timer); api.close(); dom.dispose(); } };
}
export type RoomPageController = ReturnType<typeof createRoomPage>;
