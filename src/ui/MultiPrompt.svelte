<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { MultiscreenController } from '../features/multiscreen/feature';
  import { showModal } from './modal';
  import { bindTheme } from './theme';
  import RoomAvatar from './RoomAvatar.svelte';
  let { multi }: { multi: MultiscreenController } = $props();
  let dialog: HTMLDialogElement, candidateGrid: HTMLDivElement, target = $state<number | undefined>(), input = $state(''), save = $state(false), busy = $state(false), error = $state('');
  let current = $state(untrack(() => multi.value));
  let added = $state<number[]>([]);
  const candidates = $derived([...current.rooms].sort((a, b) => Number(b.showStatus === '1') - Number(a.showStatus === '1')));
  export function show(id?: number) { target = id; input = ''; save = false; busy = false; error = ''; added = []; showModal(dialog); candidateGrid.scrollTop = 0; }
  async function submit(value = input) {
    if (busy) return; busy = true; error = '';
    try { const room = await multi.add(value, save, target); if (target !== undefined) dialog.close(); else { added = [...added, room.rid]; input = ''; } }
    catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
    finally { busy = false; }
  }
  onMount(() => multi.subscribe(value => { current = value; }));
</script>
<dialog bind:this={dialog} use:bindTheme class="compact-window multi-prompt guanyu-themed" aria-labelledby="multi-prompt-title">
  <header class="window-header"><h2 id="multi-prompt-title">{target ? '更换此分屏直播间' : '添加多屏候选'}</h2><button class="icon-button" aria-label="关闭多屏选房" onclick={() => dialog.close()}>×</button></header>
  <main><p class="help">{target ? `替换房间 ${target}，保留其画面位置。` : '添加候选不会自动播放。'}</p>
    <form onsubmit={event => { event.preventDefault(); void submit(); }}><label class="edit-title" for="multi-room">房间号或斗鱼链接</label><div class="candidate-add"><input id="multi-room" bind:value={input} placeholder="房间号或直播间链接" /><button class="button primary" disabled={busy || !input.trim()}>{busy ? '处理中…' : target ? '更换' : '添加'}</button></div><label class="filter"><input type="checkbox" bind:checked={save} />保存为常用候选</label></form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <h3>候选直播间 <small>{candidates.length}</small></h3><div bind:this={candidateGrid} class="room-grid multi-candidates">{#each candidates as room (room.rid)}{@const selected = current.selected.includes(room.rid) || added.includes(room.rid)}<button class="room-tile" data-offline={room.showStatus !== '1'} disabled={busy || selected} title={`${room.nn}（${room.rid}）· ${selected ? '已添加' : room.showStatus === '1' ? '直播中' : '未开播，可添加，暂无直播画面'}`} aria-label={`${room.nn}，${selected ? '已添加' : room.showStatus === '1' ? '直播中' : '未开播'}`} onclick={() => { void submit(String(room.rid)); }}><RoomAvatar name={room.nn} src={room.avt} offline={room.showStatus !== '1'} mark={selected ? 'done' : 'add'} /><span class="room-name">{room.nn}</span></button>{:else}<p class="help">暂无候选，可在上方输入房间号添加。</p>{/each}</div>
  </main>
</dialog>
