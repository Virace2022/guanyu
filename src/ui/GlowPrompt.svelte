<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { BackpackController } from '../features/backpack/controller';
  import type { SettingsStore } from '../config/settings';
  import { showModal } from './modal';
  import { bindTheme } from './theme';

  let { backpack, settings }: { backpack: BackpackController; settings: SettingsStore } = $props();
  let dialog: HTMLDialogElement;
  let runtime = $state(untrack(() => backpack.value));
  let count = $state(1), plannedCount = $state<number | undefined>();
  const plan = $derived(plannedCount === count ? runtime.plan : null);
  export function show() { count = settings.value.backpack.glowCount; plannedCount = undefined; showModal(dialog); }
  async function prepare() { const requested = count; plannedCount = undefined; await backpack.prepare(requested); plannedCount = requested; }
  onMount(() => backpack.subscribe(value => { runtime = value; }));
</script>

<dialog bind:this={dialog} use:bindTheme class="compact-window glow-prompt guanyu-themed" aria-labelledby="glow-title">
  <header class="window-header"><h2 id="glow-title">荧光棒续牌</h2><button class="icon-button" aria-label="关闭荧光棒续牌" onclick={() => dialog.close()}>×</button></header>
  <main class="glow-content">
    <form onsubmit={event => { event.preventDefault(); void prepare(); }}>
      <div class="glow-count-row"><label for="glow-count">每个房间赠送</label><div class="glow-count-field"><input id="glow-count" type="number" min="0" max="100000" step="1" bind:value={count} aria-describedby="glow-count-help" disabled={runtime.loading || runtime.sending} /><span>根</span></div><button class="button" disabled={runtime.loading || runtime.sending}>{runtime.loading ? '读取中…' : plan ? '重新计算' : '查看计划'}</button></div>
      <p class="help" id="glow-count-help">填 0 平均分配到全部粉丝牌房间，仅用于本次赠送。</p>
    </form>
    {#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
    {#if plan}
      <section class="glow-plan" aria-labelledby="glow-plan-title">
        <h3 id="glow-plan-title">赠送计划 <span>· {plan.name}</span></h3>
        <dl class="glow-totals"><div><dt>背包库存</dt><dd>{plan.available} 根</dd></div><div><dt>每房赠送</dt><dd>{plan.each} 根</dd></div><div><dt>合计赠送</dt><dd>{plan.total} 根</dd></div></dl>
        <div class="glow-room-heading"><h4>目标房间</h4><span>{plan.rooms.length} 个</span></div>
        <ul class="glow-rooms">{#each plan.rooms as room (room.id)}<li title={`${room.name}（${room.id}）`}><span class="glow-avatar">{#if room.avatar}<img src={room.avatar} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span aria-hidden="true">{room.name.slice(0, 1)}</span>{/if}</span><span class="glow-room-name">{room.name}</span><span class="glow-room-id">房间 {room.id}</span></li>{/each}</ul>
        {#if plan.avatarError}<p class="help">{plan.avatarError}</p>{/if}
      </section>
    {/if}
    {#if runtime.sending}<p role="status">正在按计划赠送…</p>{/if}
    {#if runtime.results.length}<ul class="glow-results" aria-label="赠送结果">{#each runtime.results as result}<li>{result}</li>{/each}</ul>{/if}
  </main>
  <footer class="compact-footer"><span>{plan ? `共 ${plan.rooms.length} 个房间 · ${plan.total} 根` : '先查看计划，再确认赠送'}</span><button class="button" onclick={() => dialog.close()}>关闭</button>{#if plan}<button class="button primary" disabled={runtime.loading || runtime.sending} onclick={() => { void backpack.send(); }}>{runtime.sending ? '正在赠送…' : '确认赠送'}</button>{/if}</footer>
</dialog>
