<script lang="ts">
  import { layoutChoices as layout, activityChoices as activities, reminderChoices as reminders } from './settings-options';
  import type { OptimizationOptions } from '../config/options';
  import type { RoomOptions } from '../config/enhancements';
  let { value = $bindable(), room = $bindable() }: { value: OptimizationOptions; room: RoomOptions } = $props();



</script>

<h1>页面整理</h1><p class="intro">调整斗鱼页面的布局，按需隐藏广告、活动和提醒。</p>
<section><h2>页面布局</h2><div class="option-list">{#each layout as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" data-setting={`optimization.${choice.key}`} bind:checked={value[choice.key]} /></label>{/each}</div></section>
<section><h2>广告与活动</h2><div class="option-list">{#each activities as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" data-setting={`optimization.${choice.key}`} bind:checked={value[choice.key]} /></label>{/each}</div></section>
<section><h2>弹窗与提醒</h2><div class="option-list">{#each reminders as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" data-setting={`room.${choice.key}`} bind:checked={room[choice.key]} /></label>{/each}</div></section>
