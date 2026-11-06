import { MultiScreenController } from './controller';
import type { SettingsStore } from '../../config/settings';
import type { TeamController } from '../team-live/controller';
import type { RoomData } from '../../adapters/douyu/rooms';
import { createState } from '../../core/state';
import styles from '../../ui/multiscreen-page.css?style';
import { createMultiAudio } from './audio';
import { mountMultiscreenAudio } from '../../adapters/douyu/multiscreen-audio';
import { mountMultiscreenLabels } from '../../adapters/douyu/multiscreen-labels';
import { createNativeMultiQuality } from '../../adapters/douyu/multiscreen-quality';
import { createMultiQuality } from './quality';

export function createMultiscreen(settings: SettingsStore, team: TeamController, prompt: (target?: number) => void) {
  const state = createState({ ready: false, active: false, currentRoom: 0, selected: [] as number[], rooms: [] as RoomData[], status: '等待官方播放器就绪' });
  const style = styles.cloneNode(true); document.head.append(style);
  const backend = new MultiScreenController({
    settings: () => settings.value.multi,
    save: (next: SettingsStore['value']['multi']) => settings.save({ ...settings.value, multi: next }),
    teamPage: () => team.value.source ? { activity: team.value.source.activity, rooms: new Map(team.value.source.rooms.map(room => [room.id, room])), statuses: team.value.statuses } : null,
    ui: { mount() {}, prompt, render() {
      const next: Omit<typeof state.value, 'status'> = { ready: !!backend.host, active: !!backend.host && backend.native.active(), currentRoom: backend.roomId || 0,
        selected: backend.host && backend.native.active() ? backend.native.order() : [], rooms: [...backend.rooms.rooms.values()] };
      const current = state.value;
      if (next.ready !== current.ready || next.active !== current.active || next.currentRoom !== current.currentRoom
        || next.selected.length !== current.selected.length || next.selected.some((id, index) => id !== current.selected[index])
        || next.rooms.length !== current.rooms.length || next.rooms.some((room, index) => room !== current.rooms[index])) state.set({ ...current, ...next });
    }, status(status: string) { state.set({ ...state.value, status }); } },
  });
  const audio = createMultiAudio();
  const audioHost = mountMultiscreenAudio(() => backend.native, audio);
  const quality = createMultiQuality(createNativeMultiQuality(() => backend.native));
  const labels = mountMultiscreenLabels(() => backend.native, audio, quality, id => backend.rooms.rooms.get(id), prompt);
  const stop = settings.subscribe(value => { backend.configure(value.multi); audioHost.apply(value.multi); });
  const stopPreview = settings.runtime.subscribe(value => labels.apply(value.multi));
  async function open() {
    if (!settings.value.multi.enabled) throw new Error('请先在多屏设置中开启增强');
    backend.connect();
    if (!backend.host) throw new Error('官方多屏尚未就绪，请稍后重试');
    await backend.refresh(true);
    if (!backend.native.active()) backend.native.control.openMultiPlayer();
    backend.native.control.showEditMutiPlayerPanel(); backend.panel.schedule();
  }
  return { subscribe: state.subscribe, get value() { return state.value; }, start: () => backend.start(), open,
    exit() { backend.native.exit(); backend.ui.render(); },
    refresh: () => backend.refresh(true), resolve: (input: string) => backend.rooms.resolve(input) as Promise<RoomData>,
    add: (input: string, save: boolean, target?: number) => backend.add(input, save, target ?? null) as Promise<RoomData>,
    remove: (id: number) => backend.native.remove(id),
    audio, quality,
    dispose() { stop(); stopPreview(); labels.dispose(); quality.dispose(); audioHost.dispose(); backend.close(); style.parentNode?.removeChild(style); },
  };
}
export type MultiscreenController = ReturnType<typeof createMultiscreen>;
