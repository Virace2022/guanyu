<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { TeamController } from '../features/team-live/controller';
  import type { SettingsStore } from '../config/settings';
  import type { Readable } from '../core/state';
  import { assignedRooms, copyLayout, emptyLayout, exportLayout, importLayout } from '../features/team-live/layout';
  import FishIcon from './FishIcon.svelte';
  import { animateContent } from './motion';
  import { dragScroll } from './drag-scroll';
  import { showModal } from './modal';

  let { team, settings, pageTheme }: { team: TeamController; settings: SettingsStore; pageTheme: Readable<'light' | 'dark'> } = $props();
  let dialog: HTMLDialogElement;
  let current = $state(untrack(() => team.value));
  let draft = $state(emptyLayout());
  let baseline = $state('');
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
  let dragging = $state<{ roomId?: string; teamId?: string; personId?: string; fromTeam?: string; fromRole?: 'captains' | 'members' } | undefined>();
  let savedTheme = $state(untrack(() => settings.value.theme));
  let accentColor = $state(untrack(() => settings.value.accentColor));
  let detectedTheme = $state<'light' | 'dark'>('light');
  const theme = $derived(savedTheme === 'page' ? detectedTheme : savedTheme);
  const dirty = $derived(JSON.stringify(draft) !== baseline);
  const selectedTeam = $derived(draft.teams.find(item => item.id === selected));
  const rooms = $derived(current.source?.rooms ?? []);
  const byId = $derived(new Map(rooms.map(room => [room.id, room])));
  const assigned = $derived(assignedRooms(draft));
  const missing = $derived([...assigned].filter(id => !byId.has(id)));
  const filtered = $derived(rooms.filter(room => (!unassignedOnly || !assigned.has(room.id))
    && (!query.trim() || `${room.name} ${room.id}`.toLowerCase().includes(query.trim().toLowerCase()))));
  const changedActivity = $derived(activity !== current.source?.activity);
  const changedElsewhere = $derived(baseline !== JSON.stringify(current.layout));

  export function show() {
    if (dialog.open) { showModal(dialog); return; }
    draft = copyLayout(team.value.layout); baseline = JSON.stringify(draft);
    activity = team.value.source?.activity ?? '';
    selected = draft.teams[0]?.id ?? 'people';
    query = ''; error = ''; message = ''; confirming = false; shareOpen = false; share = '';
    showModal(dialog);
  }

  function addTeam() {
    const id = crypto.randomUUID();
    let number = draft.teams.length + 1;
    while (draft.teams.some(team => team.name === `队伍 ${number}`)) number++;
    draft.teams.push({ id, name: `队伍 ${number}`, captains: [], members: [] });
    selected = id;
  }

  function deleteTeam(id: string) {
    const index = draft.teams.findIndex(item => item.id === id);
    draft.teams = draft.teams.filter(item => item.id !== id);
    if (selected === id) selected = draft.teams[Math.min(index, draft.teams.length - 1)]?.id ?? 'people';
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

  function drop(target: string, before?: string) {
    const item = dragging; dragging = undefined;
    if (!item || changedActivity) return;
    if (target === 'people' && item.personId && item.personId === before) return;
    if (target === item.fromTeam && item.fromRole === role && item.roomId === before) return;
    if (item.teamId) {
      const team = draft.teams.find(team => team.id === item.teamId);
      if (!team || item.teamId === target || target === 'people') return;
      draft.teams = draft.teams.filter(team => team.id !== item.teamId);
      draft.teams.splice(draft.teams.findIndex(team => team.id === target), 0, team); return;
    }
    if (!item.roomId) return;
    if (target === 'people') {
      let person = draft.people.find(person => person.id === item.personId);
      if (person) draft.people = draft.people.filter(value => value.id !== person!.id);
      else if (draft.people.some(person => person.roomId === item.roomId)) return;
      person ??= { id: crypto.randomUUID(), roomId: item.roomId, name: byId.get(item.roomId)?.name ?? item.roomId, label: '' };
      const index = before ? draft.people.findIndex(value => value.id === before) : -1;
      draft.people.splice(index < 0 ? draft.people.length : index, 0, person);
    } else {
      const team = draft.teams.find(team => team.id === target); if (!team) return;
      const from = draft.teams.find(team => team.id === item.fromTeam);
      if ([...team.captains, ...team.members].includes(item.roomId) && !(from === team && item.fromRole === role)) return;
      if (from && item.fromRole) from[item.fromRole] = from[item.fromRole].filter(id => id !== item.roomId);
      const index = before ? team[role].indexOf(before) : -1;
      team[role].splice(index < 0 ? team[role].length : index, 0, item.roomId);
    }
    selected = target;
  }

  function move(list: unknown[], index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
  }

  function save(closeAfter = false) {
    error = '';
    try {
      if (changedElsewhere) throw new Error('名单已在其他页面更新，请关闭后重新编辑');
      team.save($state.snapshot(draft), activity);
      baseline = JSON.stringify(draft); message = '名单已保存';
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
      share = exportLayout($state.snapshot(draft), activity, rooms.map(room => room.id));
      message = '已生成当前草稿的分享码，可复制给同活动的用户'; error = '';
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
  }

  function importDraft() {
    try {
      draft = importLayout(share, activity, rooms.map(room => room.id));
      selected = draft.teams[0]?.id ?? 'people';
      message = '已导入草稿，保存名单后应用'; error = '';
    } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
  }

  function leave(event: BeforeUnloadEvent) {
    if (!dialog?.open || !dirty) return;
    event.preventDefault(); event.returnValue = '';
  }

  onMount(() => {
    const stop = team.subscribe(value => { current = value; });
    const stopSettings = settings.subscribe(value => { savedTheme = value.theme; accentColor = value.accentColor; });
    const stopTheme = pageTheme.subscribe(value => { detectedTheme = value; });
    return () => { stop(); stopSettings(); stopTheme(); };
  });
</script>

<svelte:window onbeforeunload={leave} />

<dialog bind:this={dialog} class="team-window" data-theme={theme} style:--guanyu-accent={accentColor} aria-labelledby="team-title" oncancel={event => { event.preventDefault(); if (confirming) confirming = false; else close(); }}>
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
  <div class="editor-body" inert={confirming}>
    <nav class="team-nav" aria-label="名单分区">
      <button class:chosen={selected === 'people'} aria-current={selected === 'people' ? 'page' : undefined} onclick={() => { selected = 'people'; }} ondragover={event => event.preventDefault()} ondrop={event => { event.preventDefault(); event.stopPropagation(); drop('people'); }}><span>{draft.peopleTitle}</span><small>{draft.people.length}</small></button>
      <div class="team-nav-label">队伍<button class="text-button" aria-label="添加队伍" onclick={addTeam}>+</button></div>
      <div class="team-list" role="list" use:dragScroll>
        {#each draft.teams as item, index (item.id)}
          <div class="team-entry" role="listitem" class:chosen={selected === item.id} draggable="true" ondragstart={event => { dragging = { teamId: item.id }; event.dataTransfer?.setData('text/plain', item.id); }} ondragend={() => { dragging = undefined; }} ondragover={event => event.preventDefault()} ondrop={event => { event.preventDefault(); event.stopPropagation(); drop(item.id); }}><button class="team-select" aria-current={selected === item.id ? 'page' : undefined} onclick={() => { selected = item.id; }}><span class="team-number">{index + 1}</span><span class="team-name">{item.name || '未命名队伍'}</span><small>{item.captains.length + item.members.length}</small></button><button class="team-delete" aria-label={`删除队伍 ${item.name || index + 1}`} title="删除队伍" onclick={() => deleteTeam(item.id)}>×</button></div>
        {/each}
      </div>
      <button class="button add-team" onclick={addTeam}>+ 添加队伍</button>
    </nav>
    <main class="team-detail" use:animateContent={`${selected}:${role}`} use:dragScroll ondragover={event => event.preventDefault()} ondrop={event => { event.preventDefault(); drop(selected); }}>
      {#if selected === 'people'}
        <label class="edit-title" for="people-title">区域名称<input id="people-title" maxlength="40" bind:value={draft.peopleTitle} /></label>
        <p class="help">从右侧添加人物，显示名称和身份标签由你定义。</p>
        <div class="assigned-list">
          {#each draft.people as person, index (person.id)}
            <article class="person-row" class:missing={!byId.has(person.roomId)} draggable="true" ondragstart={event => { dragging = { roomId: person.roomId, personId: person.id }; event.dataTransfer?.setData('text/plain', person.roomId); }} ondragend={() => { dragging = undefined; }} ondragover={event => event.preventDefault()} ondrop={event => { event.preventDefault(); event.stopPropagation(); drop('people', person.id); }}>
              <div class="person-avatar">{#if byId.get(person.roomId)?.avatar}<img src={byId.get(person.roomId)!.avatar} alt="" loading="lazy" />{:else}<span>{person.name.slice(0, 1)}</span>{/if}</div>
              <div class="person-fields"><input aria-label={`人物 ${index + 1} 显示名称`} maxlength="40" bind:value={person.name} /><input aria-label={`人物 ${index + 1} 身份标签`} maxlength="40" bind:value={person.label} placeholder="身份标签，如嘉宾" /><small>{byId.has(person.roomId) ? `房间 ${person.roomId}` : `来源已缺失 · ${person.roomId}`}</small></div>
              <div class="row-actions"><button aria-label={`上移 ${person.name}`} disabled={index === 0} onclick={() => move(draft.people, index, -1)}>↑</button><button aria-label={`下移 ${person.name}`} disabled={index === draft.people.length - 1} onclick={() => move(draft.people, index, 1)}>↓</button><button aria-label={`移除 ${person.name}`} onclick={() => draft.people.splice(index, 1)}>×</button></div>
            </article>
          {:else}<p class="empty-list">添加团长、嘉宾或其他独立人物。<br />不预设身份，也不限制人数。</p>{/each}
        </div>
      {:else if selectedTeam}
        <div class="team-heading"><label class="edit-title" for="team-name">队伍名称<input id="team-name" maxlength="40" bind:value={selectedTeam.name} /></label></div>
        <div class="team-order"><button class="text-button" disabled={draft.teams[0]?.id === selected} onclick={() => move(draft.teams, draft.teams.findIndex(item => item.id === selected), -1)}>↑ 队伍前移</button><button class="text-button" disabled={draft.teams.at(-1)?.id === selected} onclick={() => move(draft.teams, draft.teams.findIndex(item => item.id === selected), 1)}>↓ 队伍后移</button></div>
        <div class="role-tabs" role="group" aria-label="添加成员的位置"><button aria-pressed={role === 'captains'} onclick={() => { role = 'captains'; }}>队长 · {selectedTeam.captains.length}</button><button aria-pressed={role === 'members'} onclick={() => { role = 'members'; }}>队员 · {selectedTeam.members.length}</button></div>
        <p class="help">点击右侧 + 加入{role === 'captains' ? '队长' : '队员'}；同一人物可以编入不同队伍。</p>
        <div class="assigned-list">
          {#each selectedTeam[role] as id, index (`${selected}-${role}-${id}`)}
            {@const room = byId.get(id)}
            <article class="member-row" class:missing={!room} draggable="true" ondragstart={event => { dragging = { roomId: id, fromTeam: selected, fromRole: role }; event.dataTransfer?.setData('text/plain', id); }} ondragend={() => { dragging = undefined; }} ondragover={event => event.preventDefault()} ondrop={event => { event.preventDefault(); event.stopPropagation(); drop(selected, id); }}>
              <div class="person-avatar">{#if room?.avatar}<img src={room.avatar} alt="" loading="lazy" />{:else}<span>{room?.name.slice(0, 1) ?? '?'}</span>{/if}</div>
              <div class="member-name"><strong>{room?.name ?? `房间 ${id}`}</strong><small>{room ? `${room.live ? '直播中' : '未开播'} · ${id}` : '来源已缺失，位置保留'}</small></div>
              <div class="row-actions"><button aria-label={`上移 ${room?.name ?? id}`} disabled={index === 0} onclick={() => { if (selectedTeam) move(selectedTeam[role], index, -1); }}>↑</button><button aria-label={`下移 ${room?.name ?? id}`} disabled={index === selectedTeam[role].length - 1} onclick={() => { if (selectedTeam) move(selectedTeam[role], index, 1); }}>↓</button><button aria-label={`移除 ${room?.name ?? id}`} onclick={() => selectedTeam?.[role].splice(index, 1)}>×</button></div>
            </article>
          {:else}<p class="empty-list">这一组还没有{role === 'captains' ? '队长' : '队员'}。<br />从右侧名单点击 + 添加。</p>{/each}
        </div>
      {/if}
    </main>
    <aside class="room-picker" aria-label="选择成员">
      <div class="picker-header"><h2>活动成员 <small>{filtered.length}</small></h2><input type="search" aria-label="搜索活动成员" placeholder="搜索昵称或房间号" bind:value={query} /><label class="filter"><input type="checkbox" bind:checked={unassignedOnly} />只看未分配</label></div>
      <div class="picker-list" role="list" use:dragScroll>
        {#each filtered as room (room.id)}
          <div class="picker-row" role="listitem" draggable="true" ondragstart={event => { dragging = { roomId: room.id }; event.dataTransfer?.setData('text/plain', room.id); }} ondragend={() => { dragging = undefined; }}><div class="person-avatar">{#if room.avatar}<img src={room.avatar} alt="" loading="lazy" />{:else}<span>{room.name.slice(0, 1)}</span>{/if}</div><div class="member-name"><strong>{room.name}</strong><small><span class:live={room.live}>{room.live ? '直播中' : '未开播'}</span>{assigned.has(room.id) ? ' · 已编排' : ''}</small></div><button class="add-member" aria-label={`添加 ${room.name}`} disabled={alreadyAdded(room.id) || changedActivity} title={alreadyAdded(room.id) ? '已在当前分区' : '加入当前分区'} onclick={() => addRoom(room.id)}>{alreadyAdded(room.id) ? '✓' : '+'}</button></div>
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
