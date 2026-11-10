<script lang="ts">
  import { highlightMatches, searchSettings, searchTerms, type SettingResult } from './settings-search';

  interface SearchRow { key: string; id: string; group: string; result?: SettingResult }

  let { active, onselect }: { active: boolean; onselect: (result: SettingResult) => void } = $props();
  let input: HTMLInputElement;
  let popup: HTMLDivElement;
  let wrapper: HTMLDivElement;
  let query = $state('');
  let expanded = $state(false);
  let selected = $state('');
  let collapsed = $state<Record<string, boolean>>({});
  let left = $state(0), top = $state(0), width = $state(0), height = $state(320);
  const terms = $derived(searchTerms(query));
  const groups = $derived(searchSettings(query));
  const count = $derived(groups.reduce((total, group) => total + group.items.length, 0));
  const treeGroups = $derived(groups.map((group, groupIndex) => ({
    ...group,
    header: { key: `group:${group.id}`, id: `guanyu-search-group-${groupIndex}`, group: group.id },
    rows: group.items.map((result, index) => ({ key: result.id, id: `guanyu-search-item-${groupIndex}-${index}`, group: group.id, result })),
  })));
  const rows: SearchRow[] = $derived(treeGroups.flatMap(group => [group.header, ...(collapsed[group.id] ? [] : group.rows)]));
  const current = $derived(rows.find(row => row.key === selected) ?? rows.find(row => row.result) ?? rows[0]);
  const visible = $derived(active && expanded && terms.length > 0);

  function position() {
    if (!wrapper || !visible) return;
    const rect = wrapper.getBoundingClientRect();
    width = rect.width;
    left = rect.left;
    top = rect.bottom + 6;
    height = Math.min(340, innerHeight - top - 12);
  }

  function change(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    selected = '';
    collapsed = {};
    expanded = true;
  }

  function pick(result: SettingResult) {
    expanded = false;
    onselect(result);
  }

  function clear() {
    query = '';
    collapsed = {};
    selected = '';
    expanded = false;
    input.focus();
  }

  function toggle(group: string) {
    collapsed[group] = !collapsed[group];
    selected = `group:${group}`;
  }

  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && visible) {
      event.preventDefault(); event.stopPropagation(); expanded = false;
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!terms.length) return;
      event.preventDefault();
      const index = rows.findIndex(row => row.key === current?.key);
      selected = !expanded || !rows.length ? '' : rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]!.key;
      expanded = true;
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && visible && current) {
      event.preventDefault();
      const group = treeGroups.find(value => value.id === current.group)!;
      if (event.key === 'ArrowLeft') {
        if (current.result) selected = group.header.key;
        else if (!collapsed[group.id]) toggle(group.id);
      } else if (!current.result) {
        if (collapsed[group.id]) toggle(group.id);
        else selected = group.rows[0]?.key ?? group.header.key;
      }
    } else if (event.key === 'Enter' && visible) {
      event.preventDefault();
      if (current?.result) pick(current.result);
      else if (current) toggle(current.group);
    } else if (event.key === 'Tab') expanded = false;
  }

  function outside(event: PointerEvent) {
    if (visible && !event.composedPath().includes(wrapper)) expanded = false;
  }

  $effect(() => {
    if (!active) { query = ''; expanded = false; collapsed = {}; selected = ''; }
  });

  $effect(() => {
    if (!popup) return;
    if (visible) {
      position();
      if (!popup.matches(':popover-open')) popup.showPopover();
    } else if (popup.matches(':popover-open')) popup.hidePopover();
  });

  $effect(() => {
    rows; current;
    if (visible && current) popup?.querySelector<HTMLElement>(`#${current.id} > button`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<svelte:window onresize={position} onpointerdown={outside} />

{#snippet highlighted(value: string)}
  {#each highlightMatches(value, terms) as part}
    {#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}
  {/each}
{/snippet}

<div class="settings-search" bind:this={wrapper} onfocusout={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) expanded = false; }}>
  <label class="settings-search-field">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
    <input bind:this={input} type="text" role="combobox" aria-label="搜索设置" placeholder="搜索设置" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-haspopup="tree" aria-expanded={visible} aria-controls="guanyu-setting-results" aria-activedescendant={visible ? current?.id : undefined} value={query} oninput={change} onfocus={() => { expanded = true; }} onkeydown={keydown} />
  </label>
  {#if query}<button class="search-clear" aria-label="清空搜索" onclick={clear}>×</button>{/if}
  <div class="settings-search-popup" popover="manual" bind:this={popup} style:left={`${left}px`} style:top={`${top}px`} style:width={`${width}px`} style:--search-height={`${height}px`}>
    <p class="search-count" role="status">{count ? `找到 ${count} 项 · ${groups.length} 个分组` : '没有匹配的设置'}</p>
    <ul id="guanyu-setting-results" role="tree" aria-label="设置搜索结果" class:empty={!count}>
      {#each treeGroups as group (group.id)}
        <li id={group.header.id} class="search-result-group" role="treeitem" aria-expanded={!collapsed[group.id]} aria-selected={current?.key === group.header.key} aria-labelledby={`${group.header.id}-title`}>
          <button type="button" class="search-group-toggle" class:active={current?.key === group.header.key} aria-expanded={!collapsed[group.id]} aria-controls={`${group.header.id}-items`} tabindex="-1" onpointermove={() => { selected = group.header.key; }} onmousedown={event => event.preventDefault()} onclick={() => toggle(group.id)} onkeydown={keydown}>
            <span id={`${group.header.id}-title`}>{@render highlighted(group.path)}</span>
            <small>{group.items.length}</small>
            <svg class:collapsed={collapsed[group.id]} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          {#if !collapsed[group.id]}
            <ul id={`${group.header.id}-items`} role="group" class="search-group-items">
              {#each group.rows as row (row.key)}
                <li id={row.id} role="treeitem" aria-selected={current?.key === row.key}>
                  <button type="button" class="search-result" class:active={current?.key === row.key} tabindex="-1" onpointermove={() => { selected = row.key; }} onmousedown={event => event.preventDefault()} onclick={() => pick(row.result)} onkeydown={keydown}>
                    <strong>{@render highlighted(row.result.title)}</strong>
                    <small>{@render highlighted(row.result.description)}</small>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</div>
