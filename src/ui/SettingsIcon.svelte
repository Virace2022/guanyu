<script lang="ts">
  import type { SettingsSection } from './settings-types';

  let { name }: { name: SettingsSection } = $props();
  const paths: Record<SettingsSection, string> = {
    general: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    sound: 'M3 9h4l5-4v14l-5-4H3ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14',
    optimization: 'M4 6h4m4 0h8M4 12h10m4 0h2M4 18h4m4 0h8M8 3v6m6 0v6M8 15v6',
    playback: 'M8 4v16l12-8Z',
    room: 'M3 4h18v16H3ZM3 9h18M7 6.5h.01M10 6.5h.01M7 13h10M7 16h6',
    backpack: 'M5 8h14l2 13H3ZM8 8V6a4 4 0 0 1 8 0v2M8 13h8v5H8Z',
    barrage: 'M3 4h18v13H9l-5 4v-4H3ZM7 8h10M7 12h7',
    team: 'M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3',
    multi: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
    menu: 'M3 4h18v16H3ZM7 8h.01M10 8h7M7 12h.01M10 12h7M7 16h.01M10 16h7',
    sign: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16M8 15l3 3 5-5',
  };
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
