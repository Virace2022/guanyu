<script lang="ts">
  import { onMount } from 'svelte';
  import { menuActions, menuDefaults, type MenuAction } from '../config/player-menu';
  import { readNativeMenu, type NativeMenuEntry } from '../adapters/douyu/player-menu';
  let { value = $bindable() }: { value: MenuAction[] } = $props();
  let dragging = $state<MenuAction | undefined>();
  let target = $state('');
  let announcement = $state('');
  let native = $state<NativeMenuEntry[]>([]);
  let appearance = $state('');
  const available = $derived(menuActions.filter(action => !value.includes(action.id)));
  const title = (id: MenuAction) => menuActions.find(action => action.id === id)!.label;
  const mime = 'application/x-guanyu-menu';

  onMount(() => { const source = readNativeMenu(); native = source.items; appearance = source.style; });

  function end() { dragging = undefined; target = ''; }
  function start(event: DragEvent, id: MenuAction) {
    dragging = id;
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(mime, id); }
  }
  function dragged(event: DragEvent): MenuAction | undefined {
    const id = dragging ?? event.dataTransfer?.getData(mime);
    return menuActions.find(action => action.id === id)?.id;
  }
  function insert(id: MenuAction, index: number) {
    const previous = value.indexOf(id), next = value.filter(item => item !== id);
    if (previous >= 0 && previous < index) index--;
    next.splice(index, 0, id); value = next;
    announcement = `${title(id)}已放入当前菜单，第 ${next.indexOf(id) + 1} 项`;
    end();
  }
  function remove(id: MenuAction) {
    value = value.filter(item => item !== id); announcement = `${title(id)}已移回可添加的功能`; end();
  }
  function drop(event: DragEvent, index?: number) {
    event.preventDefault(); event.stopPropagation();
    const id = dragged(event); if (id) insert(id, index ?? value.length);
  }
  function position(event: DragEvent, index: number) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0);
  }
  function keyboard(event: KeyboardEvent, id: MenuAction, active: boolean) {
    if (event.key === 'Escape') { end(); return; }
    if (event.key === 'Enter') { event.preventDefault(); if (active) remove(id); else insert(id, value.length); return; }
    if (active && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const index = value.indexOf(id), next = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (next >= 0 && next < value.length) insert(id, event.key === 'ArrowDown' ? next + 1 : next);
    }
  }
</script>

<h1>播放器右键菜单</h1>
<p class="intro">在菜单中拖动排序；从右侧拖入添加，拖回右侧移除。保存全部后应用。</p>
<div class="menu-editor" style={appearance}>
  <section>
    <h2 id="guanyu-current-menu">当前菜单</h2>
    <ul class="menu-da2a9e menu-drop-list" class:drop-active={target === 'end'} role="listbox" aria-labelledby="guanyu-current-menu" aria-describedby="guanyu-menu-help"
      ondragover={event => { event.preventDefault(); target = 'end'; }} ondrop={event => drop(event)}>
      {#each native.slice(0, 1) as item}
        <li class="disable-23f484 menu-native" role="option" aria-disabled="true" aria-selected="false">{item.label}</li>
      {/each}
      {#each value as id,index (id)}
        <li draggable="true" tabindex="0" role="option" aria-selected={dragging === id} data-menu-action={id}
          class:dragging={dragging === id} class:drop-before={target === `at:${index}`} class:drop-after={index === value.length - 1 && target === `at:${index + 1}`}
          ondragstart={event => start(event, id)} ondragend={end}
          ondragover={event => { event.preventDefault(); event.stopPropagation(); target = `at:${position(event, index)}`; }}
          ondrop={event => drop(event, position(event, index))} onkeydown={event => keyboard(event, id, true)}>{title(id)}</li>
      {:else}
        <li class="menu-empty" role="option" aria-disabled="true" aria-selected="false">拖入常用功能</li>
      {/each}
      {#each native.slice(1) as item}
        {#if item.separator}<li class="divider-f9d33d" role="presentation"></li>
        {:else}<li class="menu-native" class:disable-23f484={item.disabled} class:subItem-11a1fb={item.submenu} role="option" aria-disabled="true" aria-selected="false">{#if item.submenu}<div class="name-2f52df">{item.label}</div>{:else}{item.label}{/if}</li>{/if}
      {/each}
    </ul>
    <button class="button" onclick={() => { value = [...menuDefaults]; end(); }}>恢复默认预设</button>
  </section>
  <section>
    <h2 id="guanyu-available-menu">可添加的功能</h2>
    <ul class="menu-da2a9e menu-drop-list menu-available" class:drop-active={target === 'available'} role="listbox" aria-labelledby="guanyu-available-menu" aria-describedby="guanyu-menu-help"
      ondragover={event => { event.preventDefault(); target = 'available'; }}
      ondrop={event => { event.preventDefault(); const id = dragged(event); if (id) remove(id); }}>
      {#each available as action (action.id)}
        <li draggable="true" tabindex="0" role="option" aria-selected={dragging === action.id} class:dragging={dragging === action.id} data-menu-action={action.id}
          ondragstart={event => start(event, action.id)} ondragend={end} onkeydown={event => keyboard(event, action.id, false)}>{action.label}</li>
      {:else}<li class="menu-empty" role="option" aria-disabled="true" aria-selected="false">全部已添加，可拖回此处移除</li>{/each}
    </ul>
  </section>
</div>
<p class="help" id="guanyu-menu-help">也可聚焦功能后用方向键排序，Enter 在两栏间移动。原生菜单项保留；团播或副屏动作按当前房间状态显示。</p>
<p class="menu-announcement" role="status" aria-live="polite">{announcement}</p>
