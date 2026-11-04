import { flushSync, mount, unmount } from 'svelte';
import type { TeamController } from '../features/team-live/controller';
import type { SettingsStore } from '../config/settings';
import type { Readable } from '../core/state';
import TeamEditor from './TeamEditor.svelte';
import styles from './settings.css?style';
import editorStyles from './team-editor.css?style';
import motionStyles from './motion.css?style';
import scrollbarStyles from './scrollbars.css?style';

export function createTeamEditor(team: TeamController, settings: SettingsStore, pageTheme: Readable<'light' | 'dark'>) {
  let host: HTMLDivElement | undefined;
  let component: ReturnType<typeof mount<{
    team: TeamController; settings: SettingsStore; pageTheme: Readable<'light' | 'dark'>;
  }, { show: () => void }>> | undefined;

  function open() {
    if (!team.value.source) return;
    if (!host || !component) {
      host = document.createElement('div'); host.id = 'guanyu-team-editor';
      const root = host.attachShadow({ mode: 'open' });
      root.append(styles.cloneNode(true), editorStyles.cloneNode(true), motionStyles.cloneNode(true), scrollbarStyles.cloneNode(true));
      document.body.append(host);
      component = mount(TeamEditor, { target: root, props: { team, settings, pageTheme } });
      flushSync();
    } else if (!host.isConnected) document.body.append(host);
    component.show();
  }

  return { open, dispose() { if (component) void unmount(component); component = undefined; host?.remove(); host = undefined; } };
}
