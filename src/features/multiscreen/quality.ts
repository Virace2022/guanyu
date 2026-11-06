import { createState } from '../../core/state';

export interface QualityRate { rate: number; name: string; diamondFan?: number }
export interface QualitySnapshot { rates: QualityRate[]; rate: number | null; ready: boolean; loading: boolean; error: string }
export interface QualityRoom extends QualitySnapshot { pending: boolean }
export interface QualityPort {
  listen: (receive: (id: number, value: QualitySnapshot) => void) => void;
  sync: () => void;
  read: (id: number) => Promise<void>;
  change: (id: number, rate: number) => Promise<void>;
  dispose: () => void;
}
const empty = (): QualityRoom => ({ rates: [], rate: null, ready: false, loading: false, error: '', pending: false });

export function createMultiQuality(port: QualityPort) {
  const state = createState(new Map<number, QualityRoom>());
  const revisions = new Map<number, number>();
  function update(id: number, value: Partial<QualityRoom>) {
    const next = { ...empty(), ...state.value.get(id), ...value };
    if (JSON.stringify(next) === JSON.stringify(state.value.get(id))) return;
    const rooms = new Map(state.value);
    rooms.set(id, next); state.set(rooms);
  }
  port.listen((id, value) => update(id, value));
  return {
    subscribe: state.subscribe,
    get: (id: number) => state.value.get(id) ?? empty(),
    sync(ids: number[]) {
      for (const id of state.value.keys()) if (!ids.includes(id)) {
        revisions.set(id, (revisions.get(id) ?? 0) + 1);
        const rooms = new Map(state.value); rooms.delete(id); state.set(rooms);
      }
      if (ids.length) port.sync(); else port.dispose();
    },
    read: (id: number) => port.read(id),
    async change(id: number, rate: number) {
      const value = state.value.get(id) ?? empty();
      if (value.pending || value.ready && value.rate === rate) return;
      if (!value.rates.some(item => item.rate === rate)) return;
      const revision = (revisions.get(id) ?? 0) + 1; revisions.set(id, revision);
      update(id, { pending: true, error: '' });
      try { await port.change(id, rate); }
      catch (cause) { if (revisions.get(id) === revision) update(id, { error: cause instanceof Error ? cause.message : String(cause) }); }
      finally { if (revisions.get(id) === revision) update(id, { pending: false }); }
    },
    dispose() { port.dispose(); revisions.clear(); state.set(new Map()); },
  };
}
export type MultiQuality = ReturnType<typeof createMultiQuality>;
