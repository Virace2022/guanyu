<script lang="ts">
  import { playbackChoices as choices } from './settings-options';
  import { onMount, untrack } from 'svelte';
  import type { PlaybackOptions } from '../config/enhancements';
  import type { PlaybackController } from '../features/playback/controller';
  let { value = $bindable(), playback }: { value: PlaybackOptions; playback: PlaybackController } = $props();
  let runtime = $state(untrack(() => playback.value));
  onMount(() => playback.subscribe(next => { runtime = next; }));

</script>
<h1>播放</h1><p class="intro">设置自动全屏、画质、后台视频和滚轮音量。</p>
<section><h2>播放偏好</h2><div class="option-list">{#each choices as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" data-setting={`playback.${choice.key}`} bind:checked={value[choice.key]} /></label>{/each}</div></section>
{#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
{#if runtime.backgroundError}<p class="error" role="alert">{runtime.backgroundError}</p>{/if}
