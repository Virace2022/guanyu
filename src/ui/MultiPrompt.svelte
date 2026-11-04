<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { MultiscreenController } from '../features/multiscreen/feature';
  import type { SettingsStore } from '../config/settings';
  import { showModal } from './modal';
  let { multi, settings }: { multi: MultiscreenController; settings: SettingsStore } = $props();
  let dialog: HTMLDialogElement, target = $state<number | undefined>(), input = $state(''), save = $state(false), busy = $state(false), error = $state('');
  let current = $state(untrack(() => multi.value));
  let saved = $state(untrack(() => settings.value));
  export function show(id?: number) { target = id; input = ''; save = false; busy = false; error = ''; showModal(dialog); }
  async function submit(value = input) {
    if (busy) return; busy = true; error = '';
    try { await multi.add(value, save, target); dialog.close(); }
    catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
    finally { busy = false; }
  }
  onMount(() => { const stop = multi.subscribe(value => { current = value; }); const stopSettings = settings.subscribe(value => { saved = value; }); return () => { stop(); stopSettings(); }; });
</script>
<dialog bind:this={dialog} class="multi-prompt" data-theme={saved.theme === 'dark' ? 'dark' : 'light'} style:--guanyu-accent={saved.accentColor} aria-labelledby="multi-prompt-title">
  <header class="window-header"><h2 id="multi-prompt-title">{target ? '更换此分屏直播间' : '添加多屏候选'}</h2><button class="icon-button" aria-label="关闭多屏选房" onclick={() => dialog.close()}>×</button></header>
  <main><p class="help">{target ? `替换房间 ${target}，保留其画面位置。` : '添加候选不会自动播放。'}</p>
    <form onsubmit={event => { event.preventDefault(); void submit(); }}><label class="edit-title" for="multi-room">房间号或斗鱼链接</label><div class="candidate-add"><input id="multi-room" bind:value={input} placeholder="房间号或直播间链接" /><button class="button primary" disabled={busy || !input.trim()}>{busy ? '处理中…' : target ? '更换' : '添加'}</button></div><label class="filter"><input type="checkbox" bind:checked={save} />保存为常用候选</label></form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <h3>现有候选</h3><div class="multi-candidates">{#each current.rooms as room (room.rid)}<button class="candidate-row" disabled={busy || current.selected.includes(room.rid) || (target !== undefined && room.showStatus !== '1')} onclick={() => { void submit(String(room.rid)); }}><span>{room.nn}</span><small>{current.selected.includes(room.rid) ? '正在播放' : room.showStatus === '1' ? '直播中' : '未开播'}</small></button>{/each}</div>
  </main>
</dialog>
