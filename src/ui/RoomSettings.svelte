<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { RoomOptions } from '../config/enhancements';
  import type { RoomPageController } from '../features/room-page/controller';
  let { value = $bindable(), roomPage }: { value: RoomOptions; roomPage: RoomPageController } = $props();
  let runtime = $state(untrack(() => roomPage.value));
  onMount(() => roomPage.subscribe(next => { runtime = next; }));
  const choices: { key: keyof RoomOptions; label: string; hint: string }[] = [
    { key: 'duration', label: '本场开播时长', hint: '在主播信息旁显示已播时长，轮播与离线房间不显示成本场直播。' },
    { key: 'guild', label: '主播公会', hint: '显示真实房间资料提供的公会名称。' },
    { key: 'lastLive', label: '上次开播时间', hint: '离线时显示最近一次开播时间。' },
    { key: 'closeRecommendation', label: '关闭关播推荐弹窗', hint: '出现原生关播推荐时调用其关闭按钮。' },
    { key: 'hideUnread', label: '隐藏消息角标', hint: '隐藏个人消息与私信的未读角标，保留消息入口和内容。' },
  ];
</script>
<h1>房间页面</h1><p class="intro">补充房间信息，独立控制页面提醒。</p>
<section><h2>信息与提醒</h2><div class="option-list">{#each choices as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" bind:checked={value[choice.key]} /></label>{/each}</div></section>
{#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
