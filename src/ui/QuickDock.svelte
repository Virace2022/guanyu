<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { SettingsStore } from '../config/settings';
  import FishIcon from './FishIcon.svelte';

  let { settings, openSettings, startup }: {
    settings: SettingsStore; openSettings: () => void; startup: Promise<boolean>;
  } = $props();
  let saved = $state(untrack(() => settings.value));
  let ready = $state(false);
  onMount(() => {
    const stop = settings.runtime.subscribe(next => { saved = next; });
    let mounted = true;
    void startup.then(loaded => { if (mounted && loaded) ready = true; });
    return () => { mounted = false; stop(); };
  });
</script>

<button class="dock-trigger" class:ready aria-label="观鱼设置" aria-haspopup="dialog" title={ready ? '观鱼设置' : '正在准备观鱼，可打开设置'} style:--accent={saved.accentColor} onclick={event => { event.stopPropagation(); openSettings(); }} onkeydown={event => event.stopPropagation()}>
  <span class="dock-loading" aria-hidden="true"></span>
  <span class="dock-icon" aria-hidden="true">{#if ready}<FishIcon />{/if}</span>
</button>
