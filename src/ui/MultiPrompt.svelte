<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { MultiscreenController } from '../features/multiscreen/feature';
  import type { RoomData } from '../adapters/douyu/rooms';
  import { filterCandidates } from '../features/multiscreen/candidates';
  import { showModal } from './modal';
  import { bindTheme } from './theme';
  import RoomAvatar from './RoomAvatar.svelte';
  let { multi }: { multi: MultiscreenController } = $props();
  let dialog: HTMLDialogElement, candidateList: HTMLDivElement;
  let target = $state<number | undefined>(), input = $state(''), save = $state(false), busy = $state(false), error = $state(''), opened = $state(false);
  let current = $state(untrack(() => multi.value)), added = $state<number[]>([]);
  let results = $state<RoomData[]>([]), searching = $state(false), searchError = $state(''), page = $state(0), more = $state(false);
  let request: AbortController | undefined;
  let searchPage = 1;
  const groups = $derived(filterCandidates(current.groups, input));
  const otherRooms = $derived(results.filter(room => !current.rooms.some(candidate => candidate.rid === room.rid)));
  export function show(id?: number) {
    target = id; input = ''; save = false; busy = false; error = ''; added = []; opened = true;
    showModal(dialog); candidateList.scrollTop = 0; void multi.refresh();
  }
  async function search(query: string, nextPage: number, abort: AbortController) {
    searching = true; searchError = ''; searchPage = nextPage;
    try {
      const found = await multi.search(query, nextPage, abort.signal);
      if (abort.signal.aborted) return;
      results = nextPage === 1 ? found.rooms : [...results, ...found.rooms.filter(room => !results.some(previous => previous.rid === room.rid))];
      page = nextPage; more = found.more;
    } catch (cause) {
      if (!abort.signal.aborted) searchError = String(cause instanceof Error ? cause.message : cause);
    } finally { if (!abort.signal.aborted) searching = false; }
  }
  $effect(() => {
    const query = input.trim(), active = opened;
    results = []; page = 0; more = false; searchError = ''; searching = !!query && active;
    if (!query || !active) return;
    const abort = new AbortController(); request = abort;
    const timer = setTimeout(() => { void search(query, 1, abort); }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  });
  async function submit(room: RoomData) {
    if (busy) return; busy = true; error = '';
    try {
      const found = await multi.add(String(room.rid), save, target);
      if (target !== undefined) dialog.close(); else added = [...added, found.rid];
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
    finally { busy = false; }
  }
  function follow(checked: boolean) {
    try { multi.setUseFollow(checked); error = ''; }
    catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
  }
  onMount(() => multi.subscribe(value => { current = value; }));
</script>

{#snippet tiles(rooms: RoomData[])}
  <div class="room-grid">
    {#each rooms as room (room.rid)}
      {@const selected = current.selected.includes(room.rid) || added.includes(room.rid)}
      <button class="room-tile" disabled={busy || selected} title={`${room.nn}（${room.rid}）· ${selected ? '已添加' : '直播中'}`} aria-label={`${room.nn}，${selected ? '已添加' : target ? '更换为此直播间' : '添加候选'}`} onclick={() => { void submit(room); }}>
        <RoomAvatar name={room.nn} src={room.avt} mark={selected ? 'done' : 'add'} /><span class="room-name">{room.nn}</span>
      </button>
    {/each}
  </div>
{/snippet}

<dialog bind:this={dialog} use:bindTheme class="compact-window multi-prompt guanyu-themed" aria-labelledby="multi-prompt-title" onclose={() => { if (!dialog.open) { opened = false; request?.abort(); } }}>
  <header class="window-header"><h2 id="multi-prompt-title">{target ? '更换直播间' : '添加多屏候选'}</h2><button class="icon-button" aria-label="关闭多屏选房" onclick={() => dialog.close()}>×</button></header>
  <main>
    <div class="multi-search"><input type="search" aria-label="搜索正在直播的主播" placeholder="搜索昵称、房间号或斗鱼链接" bind:value={input} /></div>
    <div class="multi-picker-options"><label class="filter"><input type="checkbox" checked={current.useFollow} onchange={event => follow(event.currentTarget.checked)} />加入关注列表</label><label class="filter"><input type="checkbox" bind:checked={save} />保存为常用</label></div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div bind:this={candidateList} class="multi-candidates">
      {#each groups as group (group.id)}
        <section class="multi-candidate-section"><h3>{group.label}<small>{group.rooms.length}</small></h3>{@render tiles(group.rooms)}</section>
      {:else}<p class="help">{input.trim() ? '候选中没有匹配的直播间' : '暂无正在直播的候选'}</p>{/each}
      {#if input.trim()}
        <section class="multi-candidate-section"><h3>斗鱼搜索<small>直播中</small></h3>
          {@render tiles(otherRooms)}
          {#if searching}<p class="help" role="status">正在搜索…</p>{:else if searchError}<p class="error" role="alert">{searchError}</p><button class="button" onclick={() => { if (request) void search(input.trim(), searchPage, request); }}>重试搜索</button>{:else if !otherRooms.length}<p class="help" role="status">没有其他正在直播的匹配房间</p>{/if}
          {#if more}<button class="button multi-search-more" disabled={searching} onclick={() => { if (request) void search(input.trim(), page + 1, request); }}>加载更多</button>{/if}
        </section>
      {/if}
    </div>
  </main>
</dialog>
