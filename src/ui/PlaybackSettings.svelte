<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PlaybackOptions } from '../config/enhancements';
  import type { PlaybackController } from '../features/playback/controller';
  let { value = $bindable(), playback }: { value: PlaybackOptions; playback: PlaybackController } = $props();
  let runtime = $state(untrack(() => playback.value));
  onMount(() => playback.subscribe(next => { runtime = next; }));
  const choices: { key: keyof PlaybackOptions; label: string; hint: string }[] = [
    { key: 'autoWebFullscreen', label: '自动网页全屏', hint: '确认当前房间已开播后调用原生网页全屏，未开播或轮播时跳过；手动退出后本页不重复开启。' },
    { key: 'highestQuality', label: '自动最高画质', hint: '播放器就绪后选择原生列表的最高档，手动换档后本页不强制改回。' },
    { key: 'volumeWheel', label: '原生音量滚轮', hint: '在播放器原生音量区域滚动，每格调整 5%；增益按钮继续单独调整增益。' },
  ];
</script>
<h1>播放</h1><p class="intro">复用原生播放器，分别设置进入房间时的播放偏好。</p>
<section><h2>播放偏好</h2><div class="option-list">{#each choices as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" bind:checked={value[choice.key]} /></label>{/each}</div></section>
{#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
