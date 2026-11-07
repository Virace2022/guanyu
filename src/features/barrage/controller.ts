import { mountBarrage } from '../../adapters/douyu/barrage';
import type { SettingsStore } from '../../config/settings';

export function createBarrage(settings: SettingsStore, page: Window) {
  const barrage = mountBarrage(page);
  const stop = settings.runtime.subscribe(value => barrage.apply(value.barrage));
  return { dispose() { stop(); barrage.dispose(); } };
}
