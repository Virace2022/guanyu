<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import type { TeamController } from '../features/team-live/controller';
  import type { SettingsStore } from '../config/settings';
  import type { Readable } from '../core/state';
  import { assignedRooms, copyLayout, emptyLayout, exportLayout, importLayout, layoutRooms, type TeamLayout, type Person } from '../features/team-live/layout';
  import FishIcon from './FishIcon.svelte';
  import { animateContent } from './motion';
  import { pointerSort } from './pointer-sort';
  import { showModal } from './modal';

  let { team, settings, pageTheme }: { team: TeamController; settings: SettingsStore; pageTheme: Readable<'light' | 'dark'> } = $props();
  let dialog: HTMLDialogElement;
  let current = $state(untrack(() => team.value));
  let draft = $state(emptyLayout());
  let baseline = $state('');
  let savedLayout = $state('');
  let activity = $state('');
  let selected = $state('people');
  let role = $state<'captains' | 'members'>('members');
  let query = $state('');
  let unassignedOnly = $state(false);
  let confirming = $state(false);
  let shareOpen = $state(false);
  let share = $state('');
  let message = $state('');
  let error = $state('');
  type DragItem = { kind: string; id: string; roomId?: string; person?: Person; fromTeam?: string; fromRole?: 'captains' | 'members' };
  let dragging: DragItem | undefined;
  let dragBaseline: TeamLayout | undefined;
  let dragSelection = '';
  let reducedMotion = $state(false);
  let customOpen = $state(false);
  let customInput = $state('');
  let customBusy = $state(false);
  let customError = $state('');
  let customRequest = 0;
  let savedTheme = $state(untrack(() => settings.value.theme));
  let accentColor = $state(untrack(() => settings.value.accentColor));
  let detectedTheme = $state<'light' | 'dark'>('light');
  const theme = $derived(savedTheme === 'page' ? detectedTheme : savedTheme);
  const dirty = $derived(JSON.stringify(draft) !== baseline);
  const selectedTeam = $derived(draft.teams.find(item => item.id === selected));
  const rooms = $derived(layoutRooms(draft, current.source?.rooms ?? [], current.statuses));
  const byId = $derived(new Map(rooms.map(room => [room.id, room])));
  const assigned = $derived(assignedRooms(draft));
  const missing = $derived([...assigned].filter(id => !byId.has(id)));
  const filtered = $derived(rooms.filter(room => (!unassignedOnly || !assigned.has(room.id))
    && (!query.trim() || `${room.name} ${room.id}`.toLowerCase().includes(query.trim().toLowerCase()))));
  const changedActivity = $derived(activity !== current.source?.activity);
  const changedElsewhere = $derived(savedLayout !== JSON.stringify(current.layout));

  export function show() {
    if (dialog.open) { showModal(dialog); return; }
    draft = copyLayout(team.value.layout); savedLayout = JSON.stringify(draft);
    if (!draft.teams.length) addTeam();
    baseline = JSON.stringify(draft);
    activity = team.value.source?.activity ?? '';
    selected = draft.teams[0]?.id ?? 'people';
    query = ''; error = ''; message = ''; confirming = false; shareOpen = false; share = '';
    customRequest++; customOpen = false; customBusy = false; customInput = ''; customError = '';
    showModal(dialog);
  }

  function addTeam() {
    const id = crypto.randomUUID();
    let number = draft.teams.length + 1;
    while (draft.teams.some(team => team.name === `队伍 ${number}`)) number++;
    draft.teams.push({ id, name: `队伍 ${number}`, captains: [], members: [] });
    selected = id;
  }

  function addRoom(id: string) {
    if (selected === 'people') {
      if (draft.people.some(person => person.roomId === id)) return;
      draft.people.push({ id: crypto.randomUUID(), roomId: id, name: byId.get(id)?.name ?? id, label: '' });
    } else if (selectedTeam && ![...selectedTeam.captains, ...selectedTeam.members].includes(id)) {
      selectedTeam[role].push(id);
    }
  }

  function alreadyAdded(id: string) {
    return selected === 'people' ? draft.people.some(person => person.roomId === id)
      : !!selectedTeam && [...selectedTeam.captains, ...selectedTeam.members].includes(id);
  }

  async function addCustomRoom(event: SubmitEvent) {
    event.preventDefault();
    if (customBusy || changedActivity || changedElsewhere) return;
    const request = ++customRequest, expected = activity;
    customBusy = true; customError = '';
    try {
      const room = await team.resolveRoom(customInput);
      if (request !== customRequest || !dialog.open || current.source?.activity !== expected) return;
      if (!byId.has(room.id)) (draft.customRooms ??= []).push(room);
      addRoom(room.id); customInput = ''; customOpen = false;
      message = `已添加 ${room.name}，保存名单后应用`;
    } catch (cause) { if (request === customRequest) customError = cause instanceof Error ? cause.message : String(cause); }
    finally { if (request === customRequest) customBusy = false; }
  }

  function startSort(node: HTMLElement) {
    if (changedActivity || changedElsewhere) return false;
    dragBaseline = copyLayout($state.snapshot(draft)); dragSelection = selected;
    dragging = { kind: node.dataset.sortKind!, id: node.dataset.sortId!, roomId: node.dataset.roomId, fromTeam: node.dataset.teamId, fromRole: node.dataset.role as 'captains' | 'members' | undefined };
    if (dragging.kind === 'team') selected = dragging.id;
    if (dragging.kind === 'person') dragging.person = draft.people.find(person => person.id === dragging!.id);
    return true;
  }

  function detachRoom() {
    if (!dragging) return;
    if (dragging.person && draft.people.some(person => person.id === dragging!.person!.id)) draft.people = draft.people.filter(person => person.id !== dragging!.person!.id);
    const from = draft.teams.find(team => team.id === dragging!.fromTeam);
    if (from && dragging.fromRole && from[dragging.fromRole].includes(dragging.roomId!)) from[dragging.fromRole] = from[dragging.fromRole].filter(id => id !== dragging!.roomId);
    dragging.fromTeam = undefined; dragging.fromRole = undefined;
  }

  function sortOver(node: HTMLElement, after: boolean) {
    const item = dragging;
    if (!item || changedActivity || changedElsewhere) return;
    if (item.kind === 'team') {
      if (node.dataset.sortKind !== 'team' || item.id === node.dataset.sortId) return;
      const from = draft.teams.findIndex(team => team.id === item.id);
      const target = draft.teams.findIndex(team => team.id === node.dataset.sortId);
      if (target + Number(after) - Number(from < target) === from) return;
      const moved = draft.teams.splice(from, 1)[0]!;
      const index = draft.teams.findIndex(team => team.id === node.dataset.sortId);
      draft.teams.splice(index + Number(after), 0, moved); return;
    }
    const zone = node.closest<HTMLElement>('[data-sort-zone]');
    if (zone?.dataset.sortZone === 'picker') { detachRoom(); return; }
    const destination = node.dataset.sortKind === 'team' ? node.dataset.sortId : zone?.dataset.teamId;
    const people = zone?.dataset.sortZone === 'people';
    if (!item.roomId || (!people && !destination)) return;
    const targetRole = (zone?.dataset.role as 'captains' | 'members' | undefined) ?? role;
    const before = node.dataset.sortKind === 'member' || node.dataset.sortKind === 'person' ? node.dataset.sortId : undefined;
    if (people) {
      const existing = draft.people.find(person => person.roomId === item.roomId);
      if (existing && (existing.id !== item.person?.id || !before || existing.id === before)) return;
      if (existing) {
        const from = draft.people.indexOf(existing), target = draft.people.findIndex(person => person.id === before);
        if (target + Number(after) - Number(from < target) === from) return;
      }
      const person = item.person ?? { id: crypto.randomUUID(), roomId: item.roomId, name: byId.get(item.roomId)?.name ?? item.roomId, label: '' };
      detachRoom();
      const index = before ? draft.people.findIndex(person => person.id === before) : -1;
      draft.people.splice(index < 0 ? draft.people.length : index + Number(after), 0, person);
      item.person = person; selected = 'people';
    } else {
      const target = draft.teams.find(team => team.id === destination); if (!target) return;
      const same = item.fromTeam === destination && item.fromRole === targetRole;
      if ([...target.captains, ...target.members].includes(item.roomId) && (!same || !before || before === item.roomId)) return;
      if (same && before) {
        const from = target[targetRole].indexOf(item.roomId), to = target[targetRole].indexOf(before);
        if (to + Number(after) - Number(from < to) === from) return;
      }
      detachRoom();
      const index = before ? target[targetRole].indexOf(before) : -1;
      target[targetRole].splice(index < 0 ? target[targetRole].length : index + Number(after), 0, item.roomId);
      item.fromTeam = destination; item.fromRole = targetRole; selected = destination!; role = targetRole;
    }
  }

  function finishSort(cancelled: boolean) {
    if (cancelled && dragBaseline) { draft = dragBaseline; selected = dragSelection; }
    dragging = undefined; dragBaseline = undefined;
  }

  function save(closeAfter = false) {
    error = '';
    try {
      if (changedElsewhere) throw new Error('名单已在其他页面更新，请关闭后重新编辑');
      team.save($state.snapshot(draft), activity);
      baseline = JSON.stringify(draft); savedLayout = JSON.stringify(team.value.layout); message = '名单已保存';
      if (closeAfter) dialog.close();
      confirming = false;
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); confirming = false; }
  }

  function close() {
    if (dirty) confirming = true;
    else dialog.close();
  }

  function exportDraft() {
    try {
      share = exportLayout($state.snapshot(draft), activity, current.source?.rooms.map(room => room.id) ?? []);
      message = '已生成当前草稿的分享码，可复制给同活动的用户'; error = '';
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
  }

  function importDraft() {
    try {
      draft = importLayout(share, activity, current.source?.rooms.map(room => room.id) ?? []);
      if (!draft.teams.length) addTeam();
      selected = draft.teams[0]?.id ?? 'people';
      message = '已导入草稿，保存名单后应用'; error = '';
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
  }

  function leave(event: BeforeUnloadEvent) {
    if (!dialog?.open || !dirty) return;
    event.preventDefault(); event.returnValue = '';
  }

  onMount(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { reducedMotion = motion.matches; };
    updateMotion(); motion.addEventListener('change', updateMotion);
    const stop = team.subscribe(value => { current = value; });
    const stopSettings = settings.runtime.subscribe(value => { savedTheme = value.theme; accentColor = value.accentColor; });
    const stopTheme = pageTheme.subscribe(value => { detectedTheme = value; });
    return () => { customRequest++; stop(); stopSettings(); stopTheme(); motion.removeEventListener('change', updateMotion); };
  });
</script>

<svelte:window onbeforeunload={leave} />

{#snippet dragHandle(label: string)}
  <button class="drag-handle" type="button" data-drag-handle aria-label={label} title={`${label}，也可用方向键排序`}>
    <svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true" fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="3" cy="15" r="1.4" /><circle cx="9" cy="15" r="1.4" /></svg>
  </button>
{/snippet}

<dialog bind:this={dialog} class="team-window guanyu-themed" data-theme={theme} style:--guanyu-accent={accentColor} aria-labelledby="team-title" oncancel={event => { event.preventDefault(); if (confirming) confirming = false; else close(); }}>
  <header class="window-header" inert={confirming}>
    <div class="brand"><FishIcon class="brand-icon" /><strong>观鱼</strong><span class="header-divider"></span><span id="team-title">团播名单</span></div>
    <button class="icon-button" aria-label="关闭名单编辑" onclick={close}>×</button>
  </header>
  <div class="editor-summary" inert={confirming}>
    <span>{rooms.length} 位成员 · {draft.teams.length} 支队伍</span>
    <span class="muted">{current.source?.pageId ? `活动 ${current.source.pageId}` : '按房间集合识别活动'}</span>
    <button class="text-button" disabled={current.refreshing} onclick={() => { team.refresh(); void team.refreshStatus(); message = '正在更新名单与开播状态'; }}>{current.refreshing ? '刷新中…' : '更新名单与状态'}</button>
    <button class="text-button" aria-expanded={shareOpen} onclick={() => { shareOpen = !shareOpen; }}>分享 / 导入</button>
  </div>
  {#if changedActivity}<p class="editor-alert" role="alert">当前活动已变化，请关闭后重新打开；本次草稿不会覆盖其他活动。</p>{/if}
  {#if changedElsewhere}<p class="editor-alert" role="alert">保存的名单已在其他页面变化，本次草稿保留，请关闭后重新编辑。</p>{/if}
  {#if missing.length}<p class="editor-alert" role="status">有 {missing.length} 位已编排成员不在当前来源中，原房间和位置保留。</p>{/if}
  {#if shareOpen}
    <div class="share-panel" inert={confirming}>
      <label for="team-share">观鱼分享码</label><textarea id="team-share" bind:value={share} spellcheck="false" placeholder="粘贴同活动的分享码，或生成当前编辑草稿的分享码"></textarea>
      <div><button class="button" onclick={exportDraft}>生成草稿分享码</button><button class="button" disabled={!share} onclick={async () => { try { await navigator.clipboard.writeText(share); message = '分享码已复制'; } catch { error = '复制未成功，请选中分享码手动复制'; } }}>复制</button><button class="button" disabled={!share || changedActivity} onclick={importDraft}>导入到草稿</button></div>
    </div>
  {/if}
  <div class="editor-body" inert={confirming} use:pointerSort={{ start: startSort, over: sortOver, finish: finishSort }}>
    <nav class="team-nav" aria-label="名单分区">
      <button class:chosen={selected === 'people'} data-sort-zone="people" aria-current={selected === 'people' ? 'page' : undefined} onclick={() => { selected = 'people'; }}><span>{draft.peopleTitle}</span><small>{draft.people.length}</small></button>
      <div class="team-list">
        {#each draft.teams as item (item.id)}
          <div class="team-entry" data-sort-item data-sort-kind="team" data-sort-id={item.id} class:chosen={selected === item.id} animate:flip={{ duration: reducedMotion ? 0 : 140 }}>
            <button class="team-select" aria-current={selected === item.id ? 'page' : undefined} onclick={() => { selected = item.id; }}><span class="team-name">{item.name || '未命名队伍'}</span><small>{item.captains.length + item.members.length}</small></button>
            {@render dragHandle(`拖动 ${item.name || '未命名队伍'}`)}
          </div>
        {/each}
        <button class="add-team" onclick={addTeam}>+ 添加队伍</button>
      </div>
    </nav>
    <main class="team-detail" data-sort-zone={selected === 'people' ? 'people' : 'team'} data-team-id={selected === 'people' ? undefined : selected} data-role={role} use:animateContent={`${selected}:${role}`}>
      {#if selected === 'people'}
        <label class="edit-title" for="people-title">区域名称<input id="people-title" maxlength="40" bind:value={draft.peopleTitle} /></label>
        <p class="help">从右侧添加人物，显示名称和身份标签由你定义。</p>
        <div class="assigned-list">
          {#each draft.people as person, index (person.id)}
            <article class="person-row" class:missing={!byId.has(person.roomId)} data-sort-item data-sort-kind="person" data-sort-id={person.id} data-room-id={person.roomId} animate:flip={{ duration: reducedMotion ? 0 : 140 }}>
              <div class="person-avatar">{#if byId.get(person.roomId)?.avatar}<img src={byId.get(person.roomId)!.avatar} alt="" loading="lazy" />{:else}<span>{person.name.slice(0, 1)}</span>{/if}</div>
              <div class="person-fields"><input aria-label={`人物 ${index + 1} 显示名称`} maxlength="40" bind:value={person.name} /><input aria-label={`人物 ${index + 1} 身份标签`} maxlength="40" bind:value={person.label} placeholder="身份标签，如嘉宾" /><small>{byId.has(person.roomId) ? `房间 ${person.roomId}` : `来源已缺失 · ${person.roomId}`}</small></div>
              {@render dragHandle(`拖动 ${person.name}`)}
            </article>
          {:else}<p class="empty-list">添加团长、嘉宾或其他独立人物。<br />不预设身份，也不限制人数。</p>{/each}
        </div>
      {:else if selectedTeam}
        <div class="team-heading"><label class="edit-title" for="team-name">队伍名称<input id="team-name" maxlength="40" bind:value={selectedTeam.name} /></label></div>
        <div class="role-tabs" role="group" aria-label="添加成员的位置"><button data-sort-zone="team" data-team-id={selected} data-role="captains" aria-pressed={role === 'captains'} onclick={() => { role = 'captains'; }}>队长 · {selectedTeam.captains.length}</button><button data-sort-zone="team" data-team-id={selected} data-role="members" aria-pressed={role === 'members'} onclick={() => { role = 'members'; }}>队员 · {selectedTeam.members.length}</button></div>
        <p class="help">点击右侧头像添加；拖动手柄排序或换队，拖回右侧取消编排。</p>
        <div class="assigned-list">
          {#each selectedTeam[role] as id (`${selected}-${role}-${id}`)}
            {@const room = byId.get(id)}
            <article class="member-row" class:missing={!room} data-sort-item data-sort-kind="member" data-sort-id={id} data-room-id={id} data-team-id={selected} data-role={role} animate:flip={{ duration: reducedMotion ? 0 : 140 }}>
              <div class="person-avatar">{#if room?.avatar}<img src={room.avatar} alt="" loading="lazy" />{:else}<span>{room?.name.slice(0, 1) ?? '?'}</span>{/if}</div>
              <div class="member-name"><strong>{room?.name ?? `房间 ${id}`}</strong><small>{room ? `${room.live ? '直播中' : '未开播'} · ${id}` : '来源已缺失，位置保留'}</small></div>
              {@render dragHandle(`拖动 ${room?.name ?? id}`)}
            </article>
          {:else}<p class="empty-list">这一组还没有{role === 'captains' ? '队长' : '队员'}。<br />点击右侧成员头像添加。</p>{/each}
        </div>
      {/if}
    </main>
    <aside class="room-picker" aria-label="选择成员" data-sort-zone="picker">
      <div class="picker-header">
        <div class="picker-title"><h2>活动成员 <small>{filtered.length}</small></h2><button class="text-button custom-room-toggle" aria-expanded={customOpen} onclick={() => { customOpen = !customOpen; customError = ''; }}>添加自定义直播间</button></div>
        {#if customOpen}
          <form class="custom-room-form" onsubmit={addCustomRoom}>
            <label for="custom-room">房间号或直播间链接</label><input id="custom-room" bind:value={customInput} placeholder="如 71415 或斗鱼直播间链接" required />
            <div><small>添加后加入当前分区</small><button class="button" disabled={customBusy || !customInput.trim() || changedActivity || changedElsewhere}>{customBusy ? '查询中…' : '添加'}</button></div>
            {#if customError}<p role="alert">{customError}</p>{/if}
          </form>
        {/if}
        <input type="search" aria-label="搜索活动成员" placeholder="搜索昵称或房间号" bind:value={query} /><label class="filter"><input type="checkbox" bind:checked={unassignedOnly} />只看未分配</label>
      </div>
      <div class="picker-list">
        {#each filtered as room (room.id)}
          <div class="picker-row" data-sort-item data-sort-kind="picker" data-sort-id={room.id} data-room-id={room.id}>
            <button class="person-avatar picker-avatar" type="button" aria-label={`添加 ${room.name}`} disabled={alreadyAdded(room.id) || changedActivity || changedElsewhere} title={alreadyAdded(room.id) ? '已在当前分区' : '加入当前分区'} onclick={() => addRoom(room.id)}>
              {#if room.avatar}<img src={room.avatar} alt="" loading="lazy" draggable="false" />{:else}<span>{room.name.slice(0, 1)}</span>{/if}
              <span class="avatar-add" aria-hidden="true">{alreadyAdded(room.id) ? '✓' : '+'}</span>
            </button>
            <div class="member-name"><strong>{room.name}</strong><small><span class:live={room.live}>{room.live ? '直播中' : '未开播'}</span>{assigned.has(room.id) ? ' · 已编排' : ''}</small></div>
            {@render dragHandle(`拖动 ${room.name}`)}
          </div>
        {:else}<p class="empty-list">没有符合条件的成员。</p>{/each}
      </div>
    </aside>
  </div>
  <footer class="window-footer" inert={confirming}>
    <p role="status" class:error={!!error}>{error || (dirty ? '名单有未保存的修改' : message || '名单已保存')}</p>
    <div><button class="button" onclick={close}>关闭</button><button class="button primary" disabled={!dirty || changedActivity || changedElsewhere} onclick={() => save()}>保存名单</button></div>
  </footer>
  {#if confirming}
    <div class="confirm-layer"><div class="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="team-confirm-title" tabindex="-1" use:focusConfirm><h2 id="team-confirm-title">保存名单后再关闭？</h2><p>本次修改尚未应用到活动页面。</p><div class="confirm-actions"><button class="button" onclick={() => { confirming = false; }}>继续编辑</button><button class="button" onclick={() => { confirming = false; dialog.close(); }}>放弃更改</button><button class="button primary" disabled={changedActivity || changedElsewhere} onclick={() => save(true)}>保存并关闭</button></div></div></div>
  {/if}
</dialog>

<script lang="ts" module>
  function focusConfirm(node: HTMLElement) {
    const previous = (node.getRootNode() as ShadowRoot).activeElement;
    node.focus({ preventScroll: true });
    return { destroy() { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); } };
  }
</script>
