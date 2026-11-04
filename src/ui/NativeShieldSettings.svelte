<script lang="ts">
  import { onMount } from 'svelte';
  import { nativeShieldChoices, type NativeShieldOptions } from '../config/options';
  let { value = $bindable(), status }: { value: NativeShieldOptions; status: string } = $props();
  let details: HTMLDetailsElement;
  let summary: HTMLElement;
  const count = $derived(nativeShieldChoices.filter(choice => value[choice.key]).length);
  function selectAll(selected: boolean) {
    value = Object.fromEntries(nativeShieldChoices.map(choice => [choice.key, selected])) as NativeShieldOptions;
  }
  onMount(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !details.open) return;
      event.preventDefault(); event.stopPropagation();
      details.open = false; summary.focus({ preventScroll: true });
    };
    details.addEventListener('keydown', onEscape);
    return () => details.removeEventListener('keydown', onEscape);
  });
</script>

<section>
  <h2 id="guanyu-shield-title">原生特效屏蔽</h2>
  <details class="shield-select" bind:this={details}>
    <summary bind:this={summary} aria-labelledby="guanyu-shield-title guanyu-shield-selection"><span id="guanyu-shield-selection">{count === nativeShieldChoices.length ? '全部屏蔽' : count ? `已选择 ${count} 项` : '不屏蔽'}</span><span class="muted">{count} / {nativeShieldChoices.length}</span><svg class="shield-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4" /></svg></summary>
    <div class="shield-options">
      <div class="shield-actions"><button class="button" onclick={() => selectAll(true)} disabled={count === nativeShieldChoices.length}>全选</button><button class="button" onclick={() => selectAll(false)} disabled={count === 0}>清空</button></div>
      <div role="group" aria-labelledby="guanyu-shield-title">{#each nativeShieldChoices as choice (choice.key)}<label class="shield-option"><input type="checkbox" bind:checked={value[choice.key]} /><span>{choice.label}</span></label>{/each}</div>
    </div>
  </details>
  <p class="help">默认保留“屏蔽全部礼物”为关闭，其余项目开启；保存后同步到播放器和聊天栏的小星星菜单。</p>
  <p class="help">进入直播间时应用所选偏好；在原生菜单里的临时调整，下次进入时恢复。</p>
  <p class="status" role="status">{status}</p>
</section>
