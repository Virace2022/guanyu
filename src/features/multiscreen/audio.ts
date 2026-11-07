import { createState } from '../../core/state';

export function createMultiAudio() {
  const state = createState({ active: false, independent: false, master: 0, muted: false, selected: 0, rooms: [] as number[], levels: new Map<number, number>() });
  const previous = new Map<number, number>();
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  function levelsForSelection() {
    return new Map(state.value.rooms.map(id => [id, id === state.value.selected ? 1 : 0]));
  }
  return {
    subscribe: state.subscribe,
    get value() { return state.value; },
    connect(rooms: number[], main: number, master: number, muted: boolean) {
      const value = state.value;
      if (!value.active) {
        previous.clear();
        state.set({ ...value, active: true, rooms: [...rooms], master: clamp(master), muted, selected: main, levels: new Map(rooms.map(id => [id, id === main ? 1 : 0])) });
      } else if (rooms.join(',') !== value.rooms.join(',')) {
        const levels = new Map(rooms.map(id => [id, value.levels.get(id) ?? 0]));
        const selected = rooms.includes(value.selected) ? value.selected : main;
        state.set({ ...value, rooms: [...rooms], selected, levels });
      }
    },
    configure(independent: boolean) {
      const value = state.value;
      if (value.independent === independent) return;
      if (independent) state.set({ ...value, independent, levels: levelsForSelection() });
      else {
        const selected = value.levels.get(value.selected) ? value.selected : value.rooms.find(id => (value.levels.get(id) ?? 0) > 0) ?? value.selected;
        state.set({ ...value, independent, selected, master: value.master * (value.levels.get(selected) ?? 0) });
      }
    },
    setMaster(master: number) {
      if (!Number.isFinite(master)) return;
      master = clamp(master);
      if (master !== state.value.master || master > 0 && state.value.muted) state.set({ ...state.value, master, muted: master > 0 ? false : state.value.muted });
    },
    setMuted(muted: boolean) { if (muted !== state.value.muted) state.set({ ...state.value, muted }); },
    select(id: number) {
      const value = state.value;
      if (!value.rooms.includes(id)) return;
      if (!value.independent) {
        const muted = id === value.selected ? !value.muted : false;
        state.set({ ...value, selected: id, muted });
      } else {
        const level = value.levels.get(id) ?? 0;
        if (level > 0) previous.set(id, level);
        this.setLevel(id, level > 0 ? 0 : previous.get(id) ?? 1);
      }
    },
    setLevel(id: number, level: number) {
      if (!state.value.rooms.includes(id) || !Number.isFinite(level)) return;
      const levels = new Map(state.value.levels); levels.set(id, clamp(level));
      if (level > 0) previous.set(id, clamp(level));
      state.set({ ...state.value, selected: id, levels });
    },
    output(id: number) {
      const value = state.value;
      return value.muted ? 0 : value.master * (value.independent ? value.levels.get(id) ?? 0 : Number(value.selected === id));
    },
    disconnect() {
      if (state.value.active) state.set({ ...state.value, active: false, rooms: [], levels: new Map(), selected: 0 });
    },
  };
}
export type MultiAudio = ReturnType<typeof createMultiAudio>;
