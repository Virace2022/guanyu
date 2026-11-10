<script lang="ts">
  import { barrageMarks as marks } from './settings-options';
  import { onMount, untrack } from 'svelte';
  import type { BarrageOptions, NativeShieldOptions } from '../config/options';
  import type { PageTools } from '../features/page-tools/controller';
  import NativeShieldSettings from './NativeShieldSettings.svelte';
  let { value = $bindable(), shield = $bindable(), tools }: { value: BarrageOptions; shield: NativeShieldOptions; tools: PageTools } = $props();
  let runtime = $state(untrack(() => tools.value));
  onMount(() => tools.subscribe(next => { runtime = next; }));

</script>

<h1>弹幕与特效</h1><p class="intro">整理聊天标记与消息，设置礼物、进场等原生特效。</p>
<section><h2>标记与装饰</h2><div class="option-list">{#each marks as mark (mark.key)}<label class="option-row"><span><strong>{mark.label}</strong><small>{mark.hint}</small></span><input type="checkbox" data-setting={`barrage.${mark.key}`} bind:checked={value[mark.key]} /></label>{/each}</div></section>
<section><h2>消息过滤</h2><div class="option-list"><label class="option-row"><span><strong>隐藏进场提示</strong><small>隐藏聊天区底部“谁谁谁来了”的文字提示；进场动画由下方特效屏蔽控制。</small></span><input type="checkbox" data-setting="barrage.enter" bind:checked={value.enter} /></label><label class="option-row"><span><strong>隐藏活动 / 带链接的弹幕</strong><small>整条活动或链接消息不显示，粉丝牌链接不在此范围内。</small></span><input type="checkbox" data-setting="barrage.linked" bind:checked={value.linked} /></label></div></section>
<NativeShieldSettings bind:value={shield} status={runtime.shieldStatus} />
