import { mount, unmount } from 'svelte';
import type { PlayerStore } from '../adapters/douyu/player';
import type { GainController } from '../features/volume-gain/controller';
import type { SettingsStore } from '../config/settings';
import GainControl from './GainControl.svelte';
import styles from './gain.css?style';
import pageStyles from './gain-page.css?style';
import motionStyles from './motion.css?style';
import scrollbarStyles from './scrollbars.css?style';

export function mountGainControl(player: PlayerStore, gain: GainController, settings: SettingsStore) {
  const host = document.createElement('span');
  host.dataset.guanyuGain = '';
  const root = host.attachShadow({ mode: 'open' });
  root.append(styles.cloneNode(true), motionStyles.cloneNode(true), scrollbarStyles.cloneNode(true));
  const component = mount(GainControl, { target: root, props: {
    gain, settings, onOpen: (open: boolean) => { host.dataset.open = String(open); },
  } });
  const style = pageStyles.cloneNode(true);
  document.head.append(style);
  const stop = player.subscribe(({ volume, video, roomId }) => {
    if (!volume || !video || !roomId) { host.remove(); return; }
    if (volume.nextElementSibling !== host) volume.after(host);
  });
  return () => { stop(); void unmount(component); host.remove(); style.parentNode?.removeChild(style); };
}
