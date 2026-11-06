<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { SettingsStore } from '../config/settings';
  import FishIcon from './FishIcon.svelte';

  let { settings, openSettings }: {
    settings: SettingsStore; openSettings: () => void;
  } = $props();
  let saved = $state(untrack(() => settings.value));
  onMount(() => settings.runtime.subscribe(next => { saved = next; }));
</script>

<button class="dock-trigger" aria-label="观鱼设置" aria-haspopup="dialog" title="观鱼设置" style:--accent={saved.accentColor} onclick={event => { event.stopPropagation(); openSettings(); }} onkeydown={event => event.stopPropagation()}><FishIcon /></button>
