import type { SettingsStore } from '../../config/settings';
import type { PlayerStore } from '../../adapters/douyu/player';
import { mountPlayback } from '../../adapters/douyu/playback';
import { mountBackgroundVideo } from '../../adapters/douyu/background-video';
import { mountViolationPlayback } from '../../adapters/douyu/violation-playback';
import { parseViolation, type ViolationNotice } from './violation';
import { createState } from '../../core/state';

export function createPlayback(settings: SettingsStore, player: PlayerStore, isLive: () => boolean) {
  const state = createState({ error: '', backgroundError: '', violationError: '' });
  const violation = createState<ViolationNotice | null>(null);
  const adapter = mountPlayback(player, isLive, error => state.set({ ...state.value, error }));
  const background = mountBackgroundVideo(player, backgroundError => state.set({ ...state.value, backgroundError }));
  const rectification = mountViolationPlayback(player,
    event => violation.set(event ? { ...event, ...parseViolation(event.content) } : null),
    violationError => state.set({ ...state.value, violationError }));
  const stop = settings.subscribe(value => { adapter.apply(value.playback); background.apply(value.playback.keepBackgroundVideo); rectification.apply(value.playback.keepViolationPlayback); });
  return { ...state, violation, get value() { return state.value; }, dispose() { stop(); rectification.dispose(); background.dispose(); adapter.dispose(); } };
}
export type PlaybackController = ReturnType<typeof createPlayback>;
