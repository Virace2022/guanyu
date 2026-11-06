<script lang="ts">
  let { value = $bindable() }: { value: string } = $props();
  const colors = [
    { name: '斗鱼橙', color: '#ff5d23' },
    { name: '青绿', color: '#21815f' },
    { name: '湖蓝', color: '#2475c7' },
    { name: '藤紫', color: '#8054c7' },
    { name: '玫红', color: '#c64670' },
  ];
</script>

<fieldset class="accent-picker">
  <legend>主题色</legend>
  <div class="accent-options">
    {#each colors as item (item.color)}
      <button type="button" class="accent-option" aria-pressed={value.toLowerCase() === item.color} style:--swatch={item.color} onclick={() => { value = item.color; }}><span class="accent-swatch" aria-hidden="true"></span><span>{item.name}</span></button>
    {/each}
  </div>
</fieldset>
