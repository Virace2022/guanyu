import { MultiScreenController } from './controller';
import type { SettingsStore } from '../../config/settings';
import type { TeamController } from '../team-live/controller';
import type { RoomData } from '../../adapters/douyu/rooms';
import { createState } from '../../core/state';
import styles from '../../ui/multiscreen-page.css?style';
import { createMultiAudio } from './audio';
import { mountMultiscreenAudio } from '../../adapters/douyu/multiscreen-audio';

export function createMultiscreen(settings: SettingsStore, team: TeamController, prompt: (target?: number) => void, register: (item: HTMLElement) => void) {
  const state = createState({ ready: false, active: false, currentRoom: 0, selected: [] as number[], rooms: [] as RoomData[], status: '等待官方播放器就绪' });
  const style = styles.cloneNode(true); document.head.append(style);
  const backend = new MultiScreenController({
    settings: () => settings.value.multi,
    save: (next: SettingsStore['value']['multi']) => settings.save({ ...settings.value, multi: next }),
    registerReplaceMenu: register,
    teamPage: () => team.value.source ? { activity: team.value.source.activity, rooms: new Map(team.value.source.rooms.map(room => [room.id, room])), statuses: team.value.statuses } : null,
    ui: { mount() {}, prompt, render() {
      state.set({ ...state.value, ready: !!backend.host, active: !!backend.host && backend.native.active(), currentRoom: backend.roomId || 0,
        selected: backend.host && backend.native.active() ? backend.native.order() : [], rooms: [...backend.rooms.rooms.values()] });
    }, status(status: string) { state.set({ ...state.value, status }); } },
  });
  const audio = createMultiAudio();
  const audioHost = mountMultiscreenAudio(() => backend.native, audio, id => backend.rooms.rooms.get(id));
  const stop = settings.subscribe(value => { backend.configure(value.multi); audioHost.apply(value.multi); });
  async function open() {
    if (!settings.value.multi.enabled) throw new Error('请先在多屏设置中开启增强');
    backend.connect();
    if (!backend.host) throw new Error('官方多屏尚未就绪，请稍后重试');
    await backend.refresh(true);
    if (!backend.native.active()) backend.native.control.openMultiPlayer();
    backend.native.control.showEditMutiPlayerPanel(); backend.panel.schedule();
  }
  return { subscribe: state.subscribe, get value() { return state.value; }, start: () => backend.start(), open,
    refresh: () => backend.refresh(true), resolve: (input: string) => backend.rooms.resolve(input) as Promise<RoomData>,
    add: (input: string, save: boolean, target?: number) => backend.add(input, save, target ?? null) as Promise<RoomData>,
    remove: (id: number) => backend.native.remove(id),
    audio,
    dispose() { stop(); audioHost.dispose(); backend.close(); style.parentNode?.removeChild(style); },
  };
}
export type MultiscreenController = ReturnType<typeof createMultiscreen>;
