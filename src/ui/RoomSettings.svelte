<script lang="ts">
  import { roomChoices as choices } from './settings-options';
  import { onMount, untrack } from 'svelte';
  import type { RoomOptions } from '../config/enhancements';
  import type { RoomPageController } from '../features/room-page/controller';
  let { value = $bindable(), roomPage }: { value: RoomOptions; roomPage: RoomPageController } = $props();
  let runtime = $state(untrack(() => roomPage.value));
  onMount(() => roomPage.subscribe(next => { runtime = next; }));

</script>
<h1>房间信息</h1><p class="intro">补充当前主播的开播时间、时长与公会资料。</p>
<section><h2>主播与直播资料</h2><div class="option-list">{#each choices as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" data-setting={`room.${choice.key}`} bind:checked={value[choice.key]} /></label>{/each}</div></section>
{#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
