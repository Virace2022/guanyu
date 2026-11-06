<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { GainController } from '../features/volume-gain/controller';
  import type { SettingsStore } from '../config/settings';

  let { gain, settings, onOpen }: { gain: GainController; settings: SettingsStore; onOpen: (open: boolean) => void } = $props();
  let value = $state(untrack(() => gain.value));
  let appearance = $state(untrack(() => settings.value));
  let trigger: HTMLButtonElement;
  let panel: HTMLDivElement;
  let slider: HTMLInputElement;
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function position() {
    if (!open) return;
    const anchor = trigger.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - panel.offsetWidth / 2, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, anchor.top >= panel.offsetHeight + 8 ? anchor.top - panel.offsetHeight - 8 : Math.min(anchor.bottom + 8, innerHeight - panel.offsetHeight - 8))}px`;
  }

  function show() {
    clearTimeout(timer);
    if (!panel.matches(':popover-open')) panel.showPopover();
    open = true; onOpen(true); position();
  }

  function hide() {
    clearTimeout(timer);
    if (panel.matches(':popover-open')) panel.hidePopover();
    open = false; onOpen(false);
  }

  function leave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const root = panel.getRootNode() as ShadowRoot;
      if (!panel.matches(':hover') && !panel.contains(root.activeElement) && root.activeElement !== trigger) hide();
    }, 180);
  }

  onMount(() => {
    const unsubscribe = gain.subscribe(next => { value = next; });
    const stopSettings = settings.runtime.subscribe(next => { appearance = next; });
    function wheel(event: WheelEvent) {
      if (!value.available || event.ctrlKey || event.deltaY === 0) return;
      event.preventDefault(); event.stopPropagation();
      gain.setAmount(value.amount + (event.deltaY < 0 ? 5 : -5));
      show();
    }
    trigger.addEventListener('wheel', wheel, { passive: false });
    const reposition = () => position();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('fullscreenchange', reposition);
    return () => {
      unsubscribe(); stopSettings(); hide();
      trigger.removeEventListener('wheel', wheel);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('fullscreenchange', reposition);
    };
  });
</script>

<button bind:this={trigger} class="trigger" style:--accent={appearance.accentColor} aria-label={`音量增益 ${value.amount - 100}%，点击${value.amount > 100 ? '恢复原声' : '开启增益'}`} aria-haspopup="dialog" aria-controls="guanyu-gain-popup" aria-expanded={open} aria-pressed={value.amount > 100} disabled={!value.available} title="音量增益；滚轮每格调整 5%" onpointerenter={show} onpointerleave={leave} onclick={() => { gain.toggle(); show(); }} onkeydown={event => { event.stopPropagation(); if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); show(); slider.focus({ preventScroll: true }); } else if (event.key === 'Escape') { hide(); } }}>
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 10h5.5L16 6v20l-5.5-4H5zM21 14a4 4 0 0 1 0 7M25 3v6m-3-3h6" /></svg>
</button>

<div bind:this={panel} id="guanyu-gain-popup" style:--accent={appearance.accentColor} popover="auto" role="dialog" aria-label="音量增益" tabindex="-1" onpointerenter={() => clearTimeout(timer)} onpointerleave={leave} onfocusout={leave} ontoggle={event => { if (event.newState === 'closed') { open = false; onOpen(false); } }} onkeydown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); hide(); trigger.focus({ preventScroll: true }); } }}>
  <div class="heading"><span>额外增益</span><output>{value.amount - 100}% · {(value.amount / 100).toFixed(2)} 倍</output></div>
  <input bind:this={slider} type="range" aria-label="额外音量增益" aria-valuetext={`额外 ${value.amount - 100}%，${(value.amount / 100).toFixed(2)} 倍原声`} min="0" max={value.maxAmount - 100} step="1" value={value.amount - 100} disabled={!value.available || value.maxAmount === 100} oninput={event => gain.setAmount(Number(event.currentTarget.value) + 100)} />
  <div class="scale"><span>0%（原声）</span><span>+{value.maxAmount - 100}%</span></div>
  <div class="presets" role="group" aria-label="常用增益档位">{#each appearance.gainPresets as extra (extra)}<button aria-pressed={value.amount === extra + 100} disabled={!value.available || extra + 100 > value.maxAmount} title={extra + 100 > value.maxAmount ? '超出增益上限，可在声音设置中调整' : `${(1 + extra / 100).toFixed(2)} 倍原声`} onclick={() => gain.setAmount(extra + 100)}>{extra === 0 ? '原声' : `+${extra}%`}</button>{/each}</div>
  {#if !appearance.gainPresets.includes(0)}<div class="actions"><button onclick={() => gain.setAmount(100)}>恢复原声</button></div>{/if}
  <p role="status">{value.error || value.status}</p>
</div>
