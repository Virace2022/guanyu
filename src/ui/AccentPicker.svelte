<script lang="ts">
  let { value = $bindable() }: { value: string } = $props();
  const colors = [
    { name: '斗鱼橙', color: '#ff5d23', note: '默认' },
    { name: '青绿', color: '#21815f', note: '' },
    { name: '湖蓝', color: '#2475c7', note: '' },
    { name: '藤紫', color: '#8054c7', note: '' },
    { name: '玫红', color: '#c64670', note: '' },
  ];
  let custom = $state(false);
  const customSelected = $derived(custom || !colors.some(item => item.color === value.toLowerCase()));
</script>

<fieldset class="accent-picker">
  <legend>主题色</legend>
  <div class="accent-options">
    {#each colors as item (item.color)}
      <button type="button" class="accent-option" aria-pressed={!customSelected && value.toLowerCase() === item.color} style:--swatch={item.color} onclick={() => { custom = false; value = item.color; }}><span class="accent-swatch" aria-hidden="true"></span><span>{item.name}</span>{#if item.note}<small>{item.note}</small>{/if}</button>
    {/each}
    <button type="button" class="accent-option" aria-pressed={customSelected} onclick={() => { custom = true; }}><span class="accent-custom" aria-hidden="true">＋</span><span>自定义</span></button>
  </div>
  {#if customSelected}<label class="accent-custom-field" for="guanyu-accent"><span>自定义颜色</span><input id="guanyu-accent" aria-label="自定义主题色" type="color" bind:value /><span class="muted">{value}</span></label>{/if}
</fieldset>
