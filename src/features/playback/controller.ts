import type { SettingsStore } from '../../config/settings';
import type { PlayerStore } from '../../adapters/douyu/player';
import { mountPlayback } from '../../adapters/douyu/playback';
import { createState } from '../../core/state';

export function createPlayback(settings: SettingsStore, player: PlayerStore, isLive: () => boolean) {
  const state = createState({ error: '' });
  const adapter = mountPlayback(player, isLive, error => state.set({ error }));
  const stop = settings.subscribe(value => adapter.apply(value.playback));
  return { ...state, get value() { return state.value; }, dispose() { stop(); adapter.dispose(); } };
}
export type PlaybackController = ReturnType<typeof createPlayback>;
