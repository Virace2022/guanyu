<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { SettingsStore } from '../config/settings';
  import type { TeamController } from '../features/team-live/controller';
  import type { Readable } from '../core/state';
  import FishIcon from './FishIcon.svelte';

  let { settings, team, pageTheme, openSettings, openTeam }: {
    settings: SettingsStore; team: TeamController; pageTheme: Readable<'light' | 'dark'>;
    openSettings: () => void; openTeam: () => void;
  } = $props();
  let saved = $state(untrack(() => settings.value));
  let available = $state(untrack(() => !!team.value.source));
  let detected = $state<'light' | 'dark'>('light');
  let open = $state(false);
  let trigger: HTMLButtonElement;
  let panel: HTMLDivElement;
  const theme = $derived(saved.theme === 'page' ? detected : saved.theme);

  function position() {
    if (!open) return;
    const rect = trigger.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left - panel.offsetWidth - 10, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom - panel.offsetHeight, innerHeight - panel.offsetHeight - 8))}px`;
  }
  function close() { if (panel?.matches(':popover-open')) panel.hidePopover(); open = false; }
  export function dismiss() { close(); }
  function navigate(action: () => void) { close(); trigger.focus({ preventScroll: true }); action(); }
  onMount(() => {
    const stop = settings.subscribe(next => { saved = next; });
    const stopTeam = team.subscribe(next => { available = !!next.source; });
    const stopTheme = pageTheme.subscribe(next => { detected = next; });
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { stop(); stopTeam(); stopTheme(); close(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  });
</script>

<button bind:this={trigger} class="dock-trigger" aria-label="观鱼工具" aria-haspopup="dialog" aria-expanded={open} title="观鱼工具" style:--accent={saved.accentColor} onclick={event => { event.stopPropagation(); if (open) close(); else { panel.showPopover(); open = true; position(); } }} onkeydown={event => event.stopPropagation()}><FishIcon /></button>
<div bind:this={panel} class="dock-panel" data-theme={theme} style:--selected-accent={saved.accentColor} popover="auto" role="dialog" aria-label="观鱼快捷功能" tabindex="-1" onkeydown={event => event.stopPropagation()} ontoggle={event => { if (event.newState === 'closed') open = false; }}>
  <div class="dock-heading"><strong>观鱼</strong></div>
  <button onclick={() => navigate(openSettings)}>观鱼设置</button>
  {#if available}<button onclick={() => navigate(openTeam)}>团播名单</button>{/if}
</div>
