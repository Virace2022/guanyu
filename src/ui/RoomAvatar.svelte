<script lang="ts">
  let { name, src = '', mark, offline = false }: { name: string; src?: string; mark?: 'add' | 'done' | 'busy' | 'failed'; offline?: boolean } = $props();
</script>

<span class="room-avatar" class:offline data-mark={mark} aria-hidden="true">
  {#if src}<img {src} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span>{name.slice(0, 1)}</span>{/if}
  {#if mark}<span class="room-avatar-mark">
    {#if mark === 'done'}<svg class="room-avatar-check" viewBox="0 0 24 24" fill="none"><path pathLength="1" d="m5 12 4 4L19 6" /></svg>
    {:else if mark === 'busy'}<svg class="room-avatar-busy" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" /></svg>
    {:else}{mark === 'failed' ? '!' : '+'}{/if}
  </span>{/if}
</span>
