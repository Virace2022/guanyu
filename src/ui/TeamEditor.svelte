<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import type { TeamController } from '../features/team-live/controller';
  import type { SettingsStore } from '../config/settings';
  import type { Readable } from '../core/state';
  import { assignedRooms, copyLayout, emptyLayout, exportLayout, importLayout, layoutRooms, nextTeamColor, teamColors, type TeamLayout, type Person } from '../features/team-live/layout';
  import FishIcon from './FishIcon.svelte';
  import { animateContent } from './motion';
  import { pointerSort } from './pointer-sort';
  import { showModal } from './modal';
  import { confirmAction } from './confirm';
  import { actionColor } from './theme';

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
  let actionMenu: HTMLDivElement;
  let actionItem = $state<DragItem>();
  let actionAnchor: HTMLElement | undefined;
  let colorMenu = $state<HTMLDivElement>()!;
  let colorAnchor: HTMLElement | undefined;
  let colorOpen = $state(false);
  let editingPerson = $state<string>();
  let personDialog = $state<HTMLDialogElement>();
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
    && (!query.trim() || `${room.name} ${room.id}`.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => Number(assigned.has(a.id)) - Number(assigned.has(b.id))));
  const changedActivity = $derived(activity !== current.source?.activity);
  const changedElsewhere = $derived(savedLayout !== JSON.stringify(current.layout));

  export function show() {
    if (dialog.open) { showModal(dialog); return; }
    draft = copyLayout(team.value.layout); savedLayout = JSON.stringify(draft);
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
    draft.teams.push({ id, name: `队伍 ${number}`, color: nextTeamColor(draft.teams), captains: [], members: [] });
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

  function references(id: string): DragItem[] {
    return [
      ...draft.people.filter(person => person.roomId === id).map(person => ({ kind: 'person', id: person.id, roomId: id, person })),
      ...draft.teams.flatMap(item => (['captains', 'members'] as const).filter(key => item[key].includes(id))
        .map(key => ({ kind: 'member', id, roomId: id, fromTeam: item.id, fromRole: key }))),
    ];
  }

  function location(item: DragItem) {
    return item.person ? draft.peopleTitle : `${draft.teams.find(team => team.id === item.fromTeam)?.name ?? ''} · ${item.fromRole === 'captains' ? '队长' : '队员'}`;
  }

  function removeItem(item: DragItem) {
    if (item.person) draft.people = draft.people.filter(person => person.id !== item.person!.id);
    const source = draft.teams.find(team => team.id === item.fromTeam);
    if (source && item.fromRole) source[item.fromRole] = source[item.fromRole].filter(id => id !== item.roomId);
  }

  async function focusRoom(id: string) {
    await tick();
    const cards = [...dialog.querySelectorAll<HTMLElement>('[data-room-id]')];
    const card = cards.find(node => node.dataset.roomId === id && node.dataset.sortKind !== 'picker') ?? cards.find(node => node.dataset.roomId === id);
    (card?.querySelector<HTMLElement>('button') ?? dialog.querySelector<HTMLElement>('.team-detail input'))?.focus({ preventScroll: true });
  }

  function withdraw(item: DragItem) {
    if (changedActivity || changedElsewhere) return;
    removeItem(item); message = '已从此分区撤出，保存名单后应用';
    void focusRoom(item.roomId!);
  }

  async function deleteTeam(id: string) {
    const item = draft.teams.find(team => team.id === id);
    if (!item || changedActivity || changedElsewhere) return;
    const count = item.captains.length + item.members.length;
    if (count && !await confirmAction('删除队伍？', `“${item.name}”有 ${count} 位成员。删除后撤回此队的分配；没有其他归属的成员会回到未分配。`, '删除队伍')) return;
    if (changedActivity || changedElsewhere) return;
    const index = draft.teams.indexOf(item);
    draft.teams = draft.teams.filter(team => team.id !== id);
    if (selected === id) selected = draft.teams[Math.min(index, draft.teams.length - 1)]?.id ?? 'people';
    message = '队伍已从草稿删除';
    await tick(); dialog.querySelector<HTMLElement>('.team-nav [aria-current="page"]')?.focus();
  }

  function readItem(node: HTMLElement): DragItem {
    const item: DragItem = { kind: node.dataset.sortKind!, id: node.dataset.sortId!, roomId: node.dataset.roomId, fromTeam: node.dataset.teamId, fromRole: node.dataset.role as 'captains' | 'members' | undefined };
    if (item.kind === 'person') item.person = draft.people.find(person => person.id === item.id);
    return item;
  }

  async function showPopoverAt(menu: HTMLElement, anchor: HTMLElement, align: 'start' | 'end' = 'start') {
    const rect = anchor.getBoundingClientRect();
    const scale = Number(getComputedStyle(dialog).zoom);
    menu.style.left = `${rect.left / scale}px`; menu.style.top = `${rect.bottom / scale + 4}px`;
    await tick(); menu.showPopover();
    const box = menu.getBoundingClientRect();
    const left = align === 'end' ? rect.right - box.width : rect.left;
    menu.style.left = `${Math.max(8, Math.min(left, innerWidth - box.width - 8)) / scale}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4 * scale, innerHeight - box.height - 8)) / scale}px`;
  }

  async function openActions(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    const anchor = event.currentTarget as HTMLElement;
    actionItem = readItem(anchor.closest<HTMLElement>('[data-sort-item]')!);
    actionAnchor = anchor.matches('[data-sort-item]') ? anchor.querySelector<HTMLElement>('[data-card-focus]') ?? anchor : anchor;
    await showPopoverAt(actionMenu, anchor);
    actionMenu.querySelector<HTMLElement>('button')?.focus();
  }

  async function openColors(event: MouseEvent) {
    colorAnchor = event.currentTarget as HTMLElement;
    if (colorMenu.matches(':popover-open')) { colorMenu.hidePopover(); return; }
    await showPopoverAt(colorMenu, colorAnchor, 'end');
    colorMenu.querySelector<HTMLElement>('[aria-pressed="true"], input')?.focus();
  }

  function avatarKeys(event: KeyboardEvent) {
    if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
      event.stopPropagation(); void openActions(event);
    }
  }

  async function editPerson(person: Person) {
    editingPerson = person.id; actionMenu.hidePopover();
    await tick(); showModal(personDialog!);
  }

  function closeActions() {
    actionMenu.hidePopover(); actionAnchor?.focus({ preventScroll: true });
  }

  function moveItem(item: DragItem, destination: string, targetRole: 'captains' | 'members', reuse = false) {
    if (!item.roomId || changedActivity || changedElsewhere) return;
    const target = draft.teams.find(team => team.id === destination);
    if (destination !== 'people' && !target) return;
    if (!reuse) removeItem(item);
    if (destination === 'people') {
      if (!draft.people.some(person => person.roomId === item.roomId)) draft.people.push(item.person ?? { id: crypto.randomUUID(), roomId: item.roomId, name: byId.get(item.roomId)?.name ?? item.roomId, label: '' });
    } else {
      target!.captains = target!.captains.filter(id => id !== item.roomId);
      target!.members = target!.members.filter(id => id !== item.roomId);
      target![targetRole].push(item.roomId);
    }
    selected = destination; role = targetRole;
    actionMenu.hidePopover(); message = reuse ? '已同时加入当前分区，保存名单后应用' : '已移动，保存名单后应用';
    void focusRoom(item.roomId);
  }

  function menuKeys(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeActions(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...actionMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf((actionMenu.getRootNode() as ShadowRoot).activeElement as HTMLButtonElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
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
    dragging = readItem(node);
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
      if (existing && existing.id !== item.person?.id) {
        detachRoom();
        if (item.kind !== 'picker') item.person = existing;
        selected = 'people'; return;
      }
      if (existing && (!before || existing.id === before)) return;
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
      if (item.kind === 'picker' && !same && [...target.captains, ...target.members].includes(item.roomId)) {
        detachRoom(); selected = destination!; return;
      }
      if (same && (!before || before === item.roomId)) return;
      if (same && before) {
        const from = target[targetRole].indexOf(item.roomId), to = target[targetRole].indexOf(before);
        if (to + Number(after) - Number(from < to) === from) return;
      }
      detachRoom();
      target.captains = target.captains.filter(id => id !== item.roomId);
      target.members = target.members.filter(id => id !== item.roomId);
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

<dialog bind:this={dialog} class="team-window guanyu-themed" data-theme={theme} style:--guanyu-accent={accentColor} style:--guanyu-action={actionColor(accentColor)} aria-labelledby="team-title" oncancel={event => { event.preventDefault(); if (confirming) confirming = false; else close(); }}>
  <header class="window-header team-header" inert={confirming}>
    <div class="brand"><FishIcon class="brand-icon" /><strong>观鱼</strong><span class="header-divider"></span><span id="team-title">团播名单</span></div>
    <div class="editor-summary"><span>{rooms.length} 人 · {draft.teams.length} 队</span><span class="muted">{current.source?.pageId ? `活动 ${current.source.pageId}` : ''}</span></div>
    <div class="editor-tools">
      <label class="editor-display-option"><span id="editor-room-ids">房间号</span><button class="switch compact-switch" role="switch" aria-labelledby="editor-room-ids" aria-checked={current.showRoomIds} onclick={() => { try { team.setShowRoomIds(!current.showRoomIds); } catch (cause) { error = `显示偏好保存失败：${String(cause)}`; } }}><span></span></button></label>
      <button class="text-button" disabled={current.refreshing} onclick={() => { team.refresh(); void team.refreshStatus(); message = '正在更新名单与开播状态'; }}>{current.refreshing ? '刷新中…' : '更新名单与状态'}</button>
      <button class="text-button" aria-expanded={shareOpen} onclick={() => { shareOpen = !shareOpen; }}>分享 / 导入</button>
    </div>
    <button class="icon-button" aria-label="关闭名单编辑" onclick={close}>×</button>
  </header>
  {#if changedActivity}<p class="editor-alert" role="alert">当前活动已变化，请关闭后重新打开；本次草稿不会覆盖其他活动。</p>{/if}
  {#if changedElsewhere}<p class="editor-alert" role="alert">保存的名单已在其他页面变化，本次草稿保留，请关闭后重新编辑。</p>{/if}
  {#if missing.length}<p class="editor-alert" role="status">有 {missing.length} 位已分配成员不在当前来源中，原房间和位置保留。</p>{/if}
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
            <button class="remove-team" aria-label={`删除 ${item.name}`} title="删除队伍" disabled={changedActivity || changedElsewhere} onclick={() => { void deleteTeam(item.id); }}><svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M6.5 10h7" stroke-linecap="round" /></svg></button>
            <button class="team-select" aria-current={selected === item.id ? 'page' : undefined} onclick={() => { selected = item.id; }}><span class="team-dot" style:--team-color={item.color} aria-hidden="true"></span><span class="team-name" title={item.name}>{item.name || '未命名队伍'}</span><small>{item.captains.length + item.members.length}</small></button>
            {@render dragHandle(`拖动 ${item.name || '未命名队伍'}`)}
          </div>
        {/each}
        <button class="add-team" onclick={addTeam}>+ 添加队伍</button>
      </div>
    </nav>
    <main class="team-detail" data-sort-zone={selected === 'people' ? 'people' : 'team'} data-team-id={selected === 'people' ? undefined : selected} data-role={role} use:animateContent={`${selected}:${role}`}>
      {#if selected === 'people'}
        <label class="edit-title" for="people-title">区域名称<input id="people-title" maxlength="40" bind:value={draft.peopleTitle} /></label>
        <p class="help">拖动卡片换位置，右键编辑，减号撤出。</p>
        <div class="assigned-list">
          {#each draft.people as person (person.id)}
            <article class="person-row" class:missing={!byId.has(person.roomId)} data-sort-item data-drag-handle data-sort-kind="person" data-sort-id={person.id} data-room-id={person.roomId} oncontextmenu={openActions} animate:flip={{ duration: reducedMotion ? 0 : 140 }}>
              <button class="person-avatar assigned-avatar" data-card-focus aria-label={`${person.name}的操作`} aria-haspopup="menu" title="拖动整张卡片，点击或右键打开操作" disabled={changedActivity || changedElsewhere} onclick={openActions} onkeydown={avatarKeys}>{#if byId.get(person.roomId)?.avatar}<img src={byId.get(person.roomId)!.avatar} alt="" loading="lazy" draggable="false" />{:else}<span>{person.name.slice(0, 1)}</span>{/if}</button>
              <div class="member-name"><strong title={`${person.name}${person.label ? ` · ${person.label}` : ''}`}>{person.name}</strong>{#if current.showRoomIds}<small>{person.roomId}</small>{/if}</div>
              <button class="member-remove" data-sort-ignore aria-label={`撤出 ${person.name}`} title="从此分区撤出" disabled={changedActivity || changedElsewhere} onclick={() => withdraw({ kind: 'person', id: person.id, roomId: person.roomId, person })}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M6.5 10h7" stroke-linecap="round" /></svg></button>
            </article>
          {:else}<p class="empty-list">添加团长、嘉宾或其他独立人物。<br />不预设身份，也不限制人数。</p>{/each}
        </div>
      {:else if selectedTeam}
        <div class="team-heading"><label class="edit-title" for="team-name">队伍名称<input id="team-name" maxlength="40" bind:value={selectedTeam.name} /></label></div>
        <div class="role-bar">
          <div class="role-tabs" role="group" aria-label="添加成员的位置"><button data-sort-zone="team" data-team-id={selected} data-role="captains" aria-pressed={role === 'captains'} onclick={() => { role = 'captains'; }}>队长 · {selectedTeam.captains.length}</button><button data-sort-zone="team" data-team-id={selected} data-role="members" aria-pressed={role === 'members'} onclick={() => { role = 'members'; }}>队员 · {selectedTeam.members.length}</button></div>
          <button class="team-color-trigger" style:--team-color={selectedTeam.color} aria-label="设置队伍颜色" aria-haspopup="dialog" aria-expanded={colorOpen} disabled={changedActivity || changedElsewhere} onclick={openColors}><span class="team-dot" aria-hidden="true"></span>队色</button>
          <div bind:this={colorMenu} popover="auto" class="color-palette" role="dialog" aria-label="队伍颜色" tabindex="-1" onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); colorMenu.hidePopover(); colorAnchor?.focus(); } }} ontoggle={event => { colorOpen = event.newState === 'open'; if (!colorOpen && colorMenu.contains((colorMenu.getRootNode() as ShadowRoot).activeElement) && colorAnchor?.isConnected) colorAnchor.focus(); }}>
            <h2>队伍颜色</h2>
            <div class="team-colors" role="group" aria-label="选择队伍颜色">
              {#each teamColors as color}
                <button class="color-option" style:--team-color={color.value} aria-label={`队伍颜色：${color.name}`} title={color.name} aria-pressed={selectedTeam.color?.toLowerCase() === color.value} disabled={changedActivity || changedElsewhere} onclick={() => { selectedTeam.color = color.value; colorMenu.hidePopover(); colorAnchor?.focus(); }}><span></span></button>
              {/each}
              <label class="custom-color" class:chosen={!teamColors.some(color => color.value === selectedTeam.color?.toLowerCase())} title={`自定义队伍颜色：${selectedTeam.color}`}><input type="color" aria-label="自定义队伍颜色" bind:value={selectedTeam.color} disabled={changedActivity || changedElsewhere} onchange={() => { colorMenu.hidePopover(); colorAnchor?.focus(); }} /><span>自定义颜色</span></label>
            </div>
          </div>
        </div>
        <p class="help">拖动卡片换队或改角色，右键更多操作。</p>
        <div class="assigned-list">
          {#each selectedTeam[role] as id (`${selected}-${role}-${id}`)}
            {@const room = byId.get(id)}
            <article class="member-row" class:missing={!room} data-sort-item data-drag-handle data-sort-kind="member" data-sort-id={id} data-room-id={id} data-team-id={selected} data-role={role} oncontextmenu={openActions} animate:flip={{ duration: reducedMotion ? 0 : 140 }}>
              <button class="person-avatar assigned-avatar" data-card-focus aria-label={`${room?.name ?? id}的操作`} aria-haspopup="menu" title="拖动整张卡片，点击或右键打开操作" disabled={changedActivity || changedElsewhere} onclick={openActions} onkeydown={avatarKeys}>{#if room?.avatar}<img src={room.avatar} alt="" loading="lazy" draggable="false" />{:else}<span>{room?.name.slice(0, 1) ?? '?'}</span>{/if}</button>
              <div class="member-name"><strong title={room?.name}>{room?.name ?? `房间 ${id}`}</strong>{#if current.showRoomIds}<small>{id}</small>{/if}</div>
              <button class="member-remove" data-sort-ignore aria-label={`撤出 ${room?.name ?? id}`} title="从此分区撤出" disabled={changedActivity || changedElsewhere} onclick={() => withdraw({ kind: 'member', id, roomId: id, fromTeam: selected, fromRole: role })}><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M6.5 10h7" stroke-linecap="round" /></svg></button>
            </article>
          {:else}<p class="empty-list">这一组还没有{role === 'captains' ? '队长' : '队员'}。<br />点击右侧成员头像添加。</p>{/each}
        </div>
      {/if}
    </main>
    <aside class="room-picker" aria-label="选择成员" data-sort-zone="picker">
      <div class="picker-header">
        <div class="picker-title"><h2>活动成员 <small>{filtered.length}</small></h2><button class="text-button custom-room-toggle" aria-label="添加自定义直播间" title="添加自定义直播间" aria-expanded={customOpen} onclick={() => { customOpen = !customOpen; customError = ''; }}>+</button></div>
        {#if customOpen}
          <form class="custom-room-form" onsubmit={addCustomRoom}>
            <label for="custom-room">房间号或直播间链接</label><input id="custom-room" bind:value={customInput} placeholder="输入房间号或链接" required />
            <div><small>添加后加入当前分区</small><button class="button" disabled={customBusy || !customInput.trim() || changedActivity || changedElsewhere}>{customBusy ? '查询中…' : '添加'}</button></div>
            {#if customError}<p role="alert">{customError}</p>{/if}
          </form>
        {/if}
        <input type="search" aria-label="搜索活动成员" placeholder="搜索昵称" bind:value={query} /><label class="filter"><input type="checkbox" bind:checked={unassignedOnly} />只看未分配</label>
      </div>
      <div class="picker-list">
        {#each filtered as room, index (room.id)}
          {#if index === 0 || assigned.has(room.id) !== assigned.has(filtered[index - 1]!.id)}<h3 class="assignment-heading">{assigned.has(room.id) ? '已分配' : '未分配'}</h3>{/if}
          <div class="picker-row" class:allocated={assigned.has(room.id)} data-sort-item data-drag-handle data-sort-kind="picker" data-sort-id={room.id} data-room-id={room.id}>
            <button class="picker-select" data-card-focus type="button" aria-label={`${alreadyAdded(room.id) ? '已在当前分区' : assigned.has(room.id) ? '移动或复用' : '添加'} ${room.name}`} aria-disabled={alreadyAdded(room.id)} disabled={changedActivity || changedElsewhere} title={alreadyAdded(room.id) ? '已在当前分区，可拖入其他分区' : assigned.has(room.id) ? '点击选择移动或复用；拖入分区保留其他归属' : '点击添加，或拖入目标分区'} onclick={event => { if (!alreadyAdded(room.id)) assigned.has(room.id) ? void openActions(event) : addRoom(room.id); }}>
              <span class="person-avatar picker-avatar">{#if room.avatar}<img src={room.avatar} alt="" loading="lazy" draggable="false" />{:else}<span>{room.name.slice(0, 1)}</span>{/if}
              {#if !assigned.has(room.id)}<span class="avatar-add" aria-hidden="true">+</span>{/if}</span>
            <span class="member-name"><span class="picker-name-line" title={[room.name, ...references(room.id).map(location)].join('；')}><strong>{room.name}</strong><span class="assignment-marks">
              {#each references(room.id).filter(item => item.fromTeam) as reference (`${reference.fromTeam}-${reference.fromRole}`)}
                {@const referenceTeam = draft.teams.find(item => item.id === reference.fromTeam)}
                <span class="assignment-mark" style:--team-color={referenceTeam?.color} role="img" aria-label={location(reference)} title={location(reference)}>{#if reference.fromRole === 'captains'}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 1.5 2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L1.5 7.7l5.9-.9Z" /></svg>{:else}<span class="team-dot"></span>{/if}</span>
              {/each}
            </span></span></span>
            </button>
          </div>
        {:else}<p class="empty-list">没有符合条件的成员。</p>{/each}
      </div>
    </aside>
  </div>
  <div bind:this={actionMenu} popover="auto" class="member-actions" role="menu" tabindex="-1" aria-label="成员操作" onkeydown={menuKeys} ontoggle={event => { if (event.newState === 'closed' && (actionMenu.getRootNode() as ShadowRoot).activeElement === actionMenu) actionAnchor?.focus(); }}>
    {#if actionItem?.roomId}
      <strong>{byId.get(actionItem.roomId)?.name ?? actionItem.roomId}</strong>
      {#if actionItem.kind === 'picker'}
        <small>当前：{references(actionItem.roomId).map(location).join('；')}</small>
        {#each references(actionItem.roomId) as source (source.person?.id ?? `${source.fromTeam}-${source.fromRole}`)}<button role="menuitem" onclick={() => moveItem(source, selected, role)}>从{location(source)}移到当前分区</button>{/each}
        <button role="menuitem" onclick={() => moveItem(actionItem!, selected, role, true)}>同时加入当前分区</button>
      {:else}
        {#if actionItem.person}<button role="menuitem" onclick={() => { void editPerson(actionItem!.person!); }}>编辑名称与身份</button>{/if}
        <button role="menuitem" class="danger" onclick={() => { const item = actionItem!; actionMenu.hidePopover(); withdraw(item); }}>从此分区撤出</button>
        {#if !actionItem.person}<button role="menuitem" onclick={() => moveItem(actionItem!, 'people', role)}>移到{draft.peopleTitle}</button>{/if}
        {#each draft.teams as target (target.id)}
          {#each ['captains', 'members'] as targetRole}
            {#if target.id !== actionItem.fromTeam || targetRole !== actionItem.fromRole}
              <button role="menuitem" onclick={() => moveItem(actionItem!, target.id, targetRole as 'captains' | 'members')}>移到{target.name} · {targetRole === 'captains' ? '队长' : '队员'}</button>
            {/if}
          {/each}
        {/each}
      {/if}
      <button role="menuitem" onclick={closeActions}>取消</button>
    {/if}
  </div>
  {#if editingPerson}
    {@const person = draft.people.find(person => person.id === editingPerson)}
    {#if person}
      <dialog bind:this={personDialog} class="action-dialog person-editor guanyu-themed" data-theme={theme} aria-label="编辑独立人物" onclose={() => { editingPerson = undefined; void focusRoom(person.roomId); }}><form onsubmit={event => { event.preventDefault(); personDialog!.close(); }}>
        <h2>编辑独立人物</h2><label class="edit-title">显示名称<input maxlength="40" bind:value={person.name} required /></label><label class="edit-title">身份标签<input maxlength="40" bind:value={person.label} placeholder="如嘉宾" /></label><div class="confirm-actions"><button class="button primary">完成编辑</button></div>
      </form></dialog>
    {/if}
  {/if}
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
