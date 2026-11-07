<script lang="ts">
  import logo from '../../assets/brand/guanyu.svg?raw';
  let { class: className = '' }: { class?: string } = $props();
</script>

<span class={className} aria-hidden="true">{@html logo}</span>
