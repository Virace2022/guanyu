<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { NativeShieldOptions, OptimizationOptions } from '../config/options';
  import NativeShieldSettings from './NativeShieldSettings.svelte';
  import type { PageTools } from '../features/page-tools/controller';
  let { value = $bindable(), shield = $bindable(), tools }: { value: OptimizationOptions; shield: NativeShieldOptions; tools: PageTools } = $props();
  let runtime = $state(untrack(() => tools.value));
  const choices: { key: keyof OptimizationOptions; label: string; hint: string }[] = [
    { key: 'hideAds', label: '隐藏页面广告', hint: '隐藏播放器、聊天区顶部、侧栏和搜索框中的广告位，保留原生播放与页面工具。' },
    { key: 'hideTopBanner', label: '隐藏顶部大图', hint: '收起团播和普通直播间顶部的大图，包含带活动链接的主图；保留房间切换按钮。' },
    { key: 'hideRoomExtras', label: '隐藏直播间下方内容', hint: '隐藏播放器下方的视频精选、鱼吧等大块内容和页脚，保留播放器、聊天框与小工具。' },
    { key: 'hideGiftBar', label: '隐藏礼物栏', hint: '收起播放器下方礼物区域，保留原生控制栏。' },
    { key: 'hidePk', label: '隐藏 PK 条', hint: '只隐藏 PK 展示，与礼物栏和活动浮窗分别控制。' },
    { key: 'hideActivities', label: '隐藏活动浮窗', hint: '隐藏右侧大航海、段位赛等轮播挂件及收起按钮。' },
    { key: 'collapseChat', label: '收起聊天活动区', hint: '拉高弹幕列表，保留贵宾 / 钻粉人数和恢复按钮。' },
    { key: 'autoHideHeader', label: '顶栏随滚动隐藏', hint: '仅在直播间向下滚动时收起顶栏，向上滚动一段距离后显示。' },
  ];
  onMount(() => tools.subscribe(next => { runtime = next; }));
</script>

<h1>优化</h1><p class="intro">整理直播画面，让常用内容留在眼前。</p>
<NativeShieldSettings bind:value={shield} status={runtime.shieldStatus} />
<section><h2>页面显示</h2><div class="option-list">{#each choices as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" bind:checked={value[choice.key]} /></label>{/each}</div></section>
