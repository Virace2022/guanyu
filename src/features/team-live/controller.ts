import type { TeamSource, TeamSourceStore } from '../../adapters/douyu/team';
import { RoomApi } from '../../adapters/douyu/rooms';
import type { SettingsStore } from '../../config/settings';
import { createState } from '../../core/state';
import { copyLayout, emptyLayout, layoutRooms, previewGroups, validateLayout, type TeamLayout, type CustomRoom } from './layout';

const prefix = 'guanyu:team:layout:v1:';
const preferencesKey = 'guanyu:team:preferences:v1';
type Detection = 'auto' | 'include' | 'exclude';

export function createTeam(source: TeamSourceStore, storage: Storage, events: Window, settings: SettingsStore) {
  const api = new RoomApi();
  let modes: Record<string, Detection> = {}, grouped = false, showRoomIds = false, activity = '', released = false, preferenceError = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | null = null;
  const statuses = new Map<string, boolean>();
  function readPreferences() {
    const value = JSON.parse(storage.getItem(preferencesKey) ?? 'null');
    grouped = value?.grouped === true; showRoomIds = value?.showRoomIds === true; modes = value?.modes ?? {};
  }
  try { readPreferences(); } catch (cause) { preferenceError = `团播偏好读取失败：${String(cause)}`; }
  function accepted(value: TeamSource | null) { return !!value && (modes[value.activity] === 'include' || (modes[value.activity] !== 'exclude' && !value.streamPromotion)); }
  const state = createState({ source: null as TeamSource | null, candidate: source.value, layout: emptyLayout(), grouped, showRoomIds, error: preferenceError,
    detection: 'auto' as Detection, preview: false, previewMembers: false, refreshing: false, lastRefresh: 0, statusError: '', options: { ...settings.value.team, hideBanner: settings.value.optimization.hideTopBanner }, statuses });

  function updateSource() {
    const candidate = source.value;
    const rooms = candidate?.rooms.map(room => ({ ...room, live: statuses.get(room.id) ?? room.live }));
    state.set({ ...state.value, candidate, source: accepted(candidate) && candidate ? { ...candidate, rooms: rooms! } : null,
      grouped, showRoomIds, detection: modes[candidate?.activity ?? ''] ?? 'auto' });
  }
  function read() {
    let layout = emptyLayout(), error = '';
    try { const raw = activity ? storage.getItem(prefix + activity) : null; if (raw) layout = validateLayout(JSON.parse(raw)); }
    catch (cause) { error = `团播名单读取失败：${String(cause)}`; }
    state.set({ ...state.value, layout, error: error || preferenceError, preview: false, previewMembers: false });
  }
  function schedule() {
    clearInterval(timer); timer = undefined;
    if (state.value.options.autoRefresh && state.value.source) timer = setInterval(() => { if (!document.hidden) void refreshStatus(); }, state.value.options.refreshSeconds * 1000);
  }
  const stop = source.subscribe(next => {
    const changed = (next?.activity ?? '') !== activity;
    const previousIds = state.value.candidate?.rooms.map(room => room.id).join(',');
    if (!changed && previousIds !== next?.rooms.map(room => room.id).join(',')) state.set({ ...state.value, preview: false, previewMembers: false });
    activity = next?.activity ?? '';
    if (changed) {
      api.close(); pending = null; statuses.clear();
      state.set({ ...state.value, preview: false, previewMembers: false, lastRefresh: 0, refreshing: false, statusError: '' });
    }
    updateSource();
    if (changed) { read(); schedule(); if (state.value.options.autoRefresh) void refreshStatus(); }
  });
  const stopSettings = settings.runtime.subscribe(value => {
    const previous = state.value.options;
    state.set({ ...state.value, options: { ...value.team, hideBanner: value.optimization.hideTopBanner } });
    if (previous.autoRefresh !== value.team.autoRefresh || previous.refreshSeconds !== value.team.refreshSeconds) {
      schedule(); if (value.team.autoRefresh) void refreshStatus();
    }
  });

  async function refreshStatus() {
    if (pending || !state.value.source) return pending;
    const expected = activity, ids = layoutRooms(state.value.layout, state.value.source.rooms).map(room => room.id);
    state.set({ ...state.value, refreshing: true, statusError: '' });
    const task = (async () => {
      try {
        const rooms = await api.info(ids);
        if (released || expected !== activity) return;
        if (!rooms.length) throw new Error('接口未返回房间状态');
        for (const room of rooms) statuses.set(String(room.rid), room.showStatus === '1');
        updateSource(); state.set({ ...state.value, lastRefresh: Date.now() });
      } catch (cause) { if (!released && expected === activity) state.set({ ...state.value, statusError: `刷新失败，保留上次状态：${String(cause)}` }); }
      finally { if (!released && expected === activity) state.set({ ...state.value, refreshing: false }); }
    })();
    pending = task;
    await task;
    if (pending === task) pending = null;
  }
  function savePreferences() { storage.setItem(preferencesKey, JSON.stringify({ grouped, modes, showRoomIds })); }
  function setShowRoomIds(next: boolean) {
    storage.setItem(preferencesKey, JSON.stringify({ grouped, modes, showRoomIds: next }));
    showRoomIds = next; state.set({ ...state.value, showRoomIds });
  }
  function save(layout: TeamLayout, expectedActivity: string) {
    if (!activity || activity !== expectedActivity) throw new Error('活动已变化，请关闭编辑器后重新打开');
    const next = validateLayout(layout); storage.setItem(prefix + activity, JSON.stringify(next));
    state.set({ ...state.value, layout: copyLayout(next), error: '', preview: false, previewMembers: false });
  }
  function setGrouped(next: boolean) {
    grouped = next; savePreferences();
    state.set({ ...state.value, grouped, preview: false, previewMembers: false });
  }
  function setDetection(mode: Detection) {
    if (!activity) return;
    modes = { ...modes, [activity]: mode }; savePreferences();
    state.set({ ...state.value, preview: false, previewMembers: false }); updateSource(); schedule();
  }
  function setPreview(enabled: boolean, members = state.value.previewMembers) {
    if (!state.value.source) return;
    state.set({ ...state.value, preview: enabled, previewMembers: enabled && members });
    if (enabled && !state.value.lastRefresh) void refreshStatus();
  }
  function previewCount(members: boolean, currentRoom: string) {
    const value = state.value;
    const ids = value.grouped ? previewGroups(value.layout, currentRoom).flatMap(group => [...group.initial, ...(members ? group.remaining : [])])
      : value.source?.rooms.map(room => room.id) ?? [];
    return ids.filter(id => id !== currentRoom).length;
  }
  async function resolveRoom(input: string): Promise<CustomRoom> {
    const room = await api.resolve(input);
    return { id: String(room.rid), name: room.nn, avatar: room.avt, live: room.showStatus === '1' };
  }
  function onStorage(event: StorageEvent) {
    if (event.key === prefix + activity || event.key === null) read();
    if (event.key === preferencesKey || event.key === null) {
      try {
        const previousGrouped = grouped, previousMode = modes[activity];
        readPreferences();
        const changed = previousGrouped !== grouped || previousMode !== modes[activity];
        state.set({ ...state.value, showRoomIds, ...(changed ? { preview: false, previewMembers: false } : {}) }); updateSource(); schedule();
      }
      catch (cause) { state.set({ ...state.value, error: `团播偏好读取失败：${String(cause)}` }); }
    }
  }
  events.addEventListener('storage', onStorage);
  return { subscribe: state.subscribe, get value() { return state.value; }, save, setGrouped, setDetection, setShowRoomIds, setPreview, previewCount, refreshStatus, resolveRoom, refresh: source.refresh,
    dispose() { released = true; clearInterval(timer); api.close(); stop(); stopSettings(); events.removeEventListener('storage', onStorage); } };
}
export type TeamController = ReturnType<typeof createTeam>;
