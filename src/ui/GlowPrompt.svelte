<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { BackpackController } from '../features/backpack/controller';
  import type { SettingsStore } from '../config/settings';
  import { showModal } from './modal';
  import { bindTheme } from './theme';
  import RoomAvatar from './RoomAvatar.svelte';

  let { backpack, settings }: { backpack: BackpackController; settings: SettingsStore } = $props();
  let dialog: HTMLDialogElement;
  let runtime = $state(untrack(() => backpack.value));
  let count = $state<number | undefined>(1);
  const plan = $derived(runtime.plan);
  const started = $derived(Object.keys(runtime.deliveries).length > 0);
  const finished = $derived(!!plan?.rooms.length && plan.rooms.every(room => runtime.deliveries[room.id]?.status === 'sent'));
  export function show() {
    showModal(dialog);
    if (!runtime.sending) { count = settings.value.backpack.glowCount; void backpack.prepare(count); }
  }
  function changeCount(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
    count = Number.isFinite(value) ? value : undefined;
    backpack.setGlowCount(value);
  }
  onMount(() => backpack.subscribe(value => { runtime = value; }));
</script>

<dialog bind:this={dialog} use:bindTheme class="compact-window glow-prompt guanyu-themed" aria-labelledby="glow-title">
  <header class="window-header"><h2 id="glow-title">荧光棒续牌</h2><button class="icon-button" aria-label="关闭荧光棒续牌" onclick={() => dialog.close()}>×</button></header>
  <main class="glow-content">
    <form onsubmit={event => { event.preventDefault(); void backpack.send(); }}>
      <div class="glow-count-row"><label for="glow-count">每个房间赠送</label><div class="glow-count-field"><input id="glow-count" type="number" min="0" max="100000" step="1" value={count ?? ''} oninput={changeCount} aria-describedby="glow-count-help" disabled={runtime.preparing || runtime.sending} /><span>根</span></div><button class="button primary" disabled={!plan || count === undefined || !!runtime.glowError || runtime.preparing || runtime.sending}>{runtime.sending ? '正在赠送…' : started ? '再次赠送' : '确认赠送'}</button></div>
      <p class="help" id="glow-count-help">填 0 时，把背包里的同种荧光棒平均分给全部持牌房间。</p>
      {#if Object.keys(runtime.sent).length}<p class="help">已送记录仅作提示，每次确认都会再向全部目标房间赠送。</p>{/if}
      {#if runtime.sending}<p class="status" role="status">关闭窗口后仍会继续赠送，可重新打开查看进度。</p>{/if}
    </form>
    {#if runtime.glowError}<p class="error" role="alert">{runtime.glowError}</p>{/if}
    {#if runtime.sendError}<p class="error" role="alert">{runtime.sendError}</p>{/if}
    {#if plan}
      <section class="glow-plan" aria-labelledby="glow-plan-title">
        <h3 id="glow-plan-title">赠送计划 <span>· {plan.name}</span></h3>
        <dl class="glow-totals"><div><dt>背包库存</dt><dd>{plan.available} 根</dd></div><div><dt>每房赠送</dt><dd>{plan.each} 根</dd></div><div><dt>合计赠送</dt><dd>{plan.total} 根</dd></div></dl>
        <div class="glow-room-heading"><h4>目标房间</h4><span>{plan.rooms.length} 个</span></div>
        <ul class="room-grid glow-rooms">{#each plan.rooms as room (room.id)}{@const delivery = runtime.deliveries[room.id]}{@const sent = runtime.sent[room.id] || 0}<li class="room-tile" data-status={delivery?.status} title={`${room.name}（${room.id}）${sent ? ` · 本页已送 ${sent} 根` : ''}${delivery?.error ? ` · ${delivery.error}` : ''}`}><RoomAvatar name={room.name} src={room.avatar} mark={delivery?.status === 'sending' ? 'busy' : delivery?.status === 'failed' ? 'failed' : sent ? 'done' : undefined} /><span class="room-name">{room.name}</span>{#if sent}<small class="room-detail">已送 {sent} 根</small>{/if}<span class="visually-hidden">房间 {room.id}{delivery?.status === 'sending' ? '，正在赠送' : delivery?.status === 'failed' ? '，本次赠送失败' : ''}</span></li>{/each}</ul>
        {#if plan.avatarError}<p class="help">{plan.avatarError}</p>{/if}
      </section>
    {:else if runtime.preparing}<p class="glow-loading" role="status">正在读取库存与目标房间…</p>{/if}
    <p class="visually-hidden" role="status">{runtime.sending ? '正在赠送' : finished ? '赠送完成' : ''}</p>
  </main>
</dialog>
