<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { MultiOptions } from '../config/multiscreen';
  import type { MultiscreenController } from '../features/multiscreen/feature';
  let { value = $bindable(), multi, onNavigate }: { value: MultiOptions; multi: MultiscreenController; onNavigate: () => void } = $props();
  let runtime = $state(untrack(() => multi.value)), input = $state(''), busy = $state(false), error = $state('');
  onMount(() => multi.subscribe(next => { runtime = next; }));
  async function add() {
    busy = true; error = '';
    try { const room = await multi.resolve(input); if (!value.custom.includes(room.rid)) value.custom = [...value.custom, room.rid]; input = ''; }
    catch (cause) { error = String(cause instanceof Error ? cause.message : cause); }
    finally { busy = false; }
  }
  async function open() { try { await multi.open(); error = ''; onNavigate(); } catch (cause) { error = String(cause instanceof Error ? cause.message : cause); } }
</script>
<h1>官方多屏</h1><p class="intro">沿用斗鱼官方播放器、拖动排序与选房面板。</p>
<section><h2>增强选项</h2><div class="option-list"><label class="option-row"><span><strong>开启官方多屏增强</strong><small>补充入口与候选，点击开启后才加载额外画面；本地模式最多四屏。</small></span><input type="checkbox" bind:checked={value.enabled} /></label>
<label class="option-row"><span><strong>使用关注名单</strong><small>普通直播间读取完整关注列表，不修改关注关系。</small></span><input type="checkbox" bind:checked={value.useFollow} /></label>
<label class="option-row"><span><strong>独立控制各直播间音量</strong><small>默认关闭，点击画面头像上的喇叭切换唯一发声房间，底部音量控制这一路。开启后悬停头像分别调节，底部音量作为总比例。</small></span><input type="checkbox" bind:checked={value.independentVolume} /></label>
<label class="option-row"><span><strong>标签集中到画面中间</strong><small>默认开启，拖动后仍贴近各画面相邻的内侧角。关闭后所有标签恢复到各自画面的左下角，主直播间也一样。</small></span><input type="checkbox" bind:checked={value.centerLabels} /></label>
<label class="option-row"><span><strong>紧凑选房</strong><small>两行 16:9 缩略图，内部纵向滚动，关闭恢复原生大图。</small></span><input type="checkbox" bind:checked={value.compact} /></label></div><p class="help">保存后应用。真实官方活动优先，其次使用团播名单或关注名单，再合并常用与临时候选。</p></section>
<section><h2>常用候选</h2><form onsubmit={event => { event.preventDefault(); void add(); }}><label class="edit-title" for="multi-custom-room">房间号或斗鱼直播间链接</label><div class="candidate-add"><input id="multi-custom-room" bind:value={input} placeholder="例如 6979222" /><button class="button" disabled={busy || !input.trim()}>{busy ? '读取中…' : '添加到草稿'}</button></div></form>
<ul class="custom-rooms">{#each value.custom as id (id)}<li><span>{runtime.rooms.find(room => room.rid === id)?.nn ?? `房间 ${id}`}</span><small>{id}</small><button class="icon-button" aria-label={`移除候选 ${id}`} onclick={() => { value.custom = value.custom.filter(room => room !== id); }}>×</button></li>{:else}<li class="help">还没有常用候选。</li>{/each}</ul><p class="help">添加候选不会自动播放；保存全部后进入原生选房名单。</p></section>
<section><h2>当前页面</h2><p class="status" role="status">{runtime.status}</p><div class="inline-actions"><button class="button" disabled={!runtime.ready} onclick={() => { void open(); }}>开启 / 编辑多屏</button><button class="button" disabled={!runtime.ready} onclick={() => { void multi.refresh(); }}>刷新候选</button></div><p class="help">在副屏右键选择“更换此分屏直播间”，保留该位置换人。主房间不能被移除；取消最后一个副屏恢复单屏。</p>{#if error}<p class="error" role="alert">{error}</p>{/if}</section>
