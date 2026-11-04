import type { TeamController } from '../features/team-live/controller';
import type { MultiscreenController } from '../features/multiscreen/feature';
import { flushSync, mount, unmount } from 'svelte';
import type { SettingsStore } from '../config/settings';
import type { GainController } from '../features/volume-gain/controller';
import type { Readable } from '../core/state';
import Settings from './Settings.svelte';
import styles from './settings.css?style';
import menuStyles from './native-menu.css?style';
import motionStyles from './motion.css?style';
import scrollbarStyles from './scrollbars.css?style';
import type { PageTools } from '../features/page-tools/controller';
import type { SettingsSection } from './settings-types';
import type { SignController } from '../features/sign/feature';
import type { BackpackController } from '../features/backpack/controller';
import type { PlaybackController } from '../features/playback/controller';
import type { RoomPageController } from '../features/room-page/controller';

export function createSettingsWindow(settings: SettingsStore, gain: GainController, pageTheme: Readable<'light' | 'dark'>, tools: PageTools, team: TeamController, multi: MultiscreenController, sign: SignController, backpack: BackpackController, playback: PlaybackController, roomPage: RoomPageController, openTeam: () => void) {
  let host: HTMLDivElement | undefined;
  let component: ReturnType<typeof mount<{
    settings: SettingsStore; gain: GainController; pageTheme: Readable<'light' | 'dark'>; tools: PageTools; team: TeamController; multi: MultiscreenController; sign: SignController; backpack: BackpackController; playback: PlaybackController; roomPage: RoomPageController; openTeam: () => void;
  }, { show: (target?: SettingsSection) => void }>> | undefined;

  function open(target?: SettingsSection) {
    if (!host || !component) {
      host = document.createElement('div');
      host.id = 'guanyu-settings';
      const root = host.attachShadow({ mode: 'open' });
      root.append(styles.cloneNode(true), menuStyles.cloneNode(true), motionStyles.cloneNode(true), scrollbarStyles.cloneNode(true));
      document.body.append(host);
      component = mount(Settings, { target: root, props: { settings, gain, pageTheme, tools, team, multi, sign, backpack, playback, roomPage, openTeam } });
      flushSync();
    } else if (!host.isConnected) document.body.append(host);
    component.show(target);
  }

  return {
    open,
    dispose() {
      if (component) void unmount(component);
      component = undefined;
      host?.remove(); host = undefined;
    },
  };
}
