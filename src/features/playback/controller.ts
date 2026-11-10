import type { SettingsStore } from '../../config/settings';
import type { PlayerStore } from '../../adapters/douyu/player';
import { mountPlayback } from '../../adapters/douyu/playback';
import { mountBackgroundVideo } from '../../adapters/douyu/background-video';
import { createState } from '../../core/state';

export function createPlayback(settings: SettingsStore, player: PlayerStore, isLive: () => boolean) {
  const state = createState({ error: '', backgroundError: '' });
  const adapter = mountPlayback(player, isLive, error => state.set({ ...state.value, error }));
  const background = mountBackgroundVideo(player, backgroundError => state.set({ ...state.value, backgroundError }));
  const stop = settings.subscribe(value => { adapter.apply(value.playback); background.apply(value.playback.keepBackgroundVideo); });
  return { ...state, get value() { return state.value; }, dispose() { stop(); background.dispose(); adapter.dispose(); } };
}
export type PlaybackController = ReturnType<typeof createPlayback>;
