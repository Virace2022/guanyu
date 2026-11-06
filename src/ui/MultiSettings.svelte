<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { MultiOptions } from '../config/multiscreen';
  import type { MultiscreenController } from '../features/multiscreen/feature';
  import RoomAvatar from './RoomAvatar.svelte';
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
<section><h2>主播标签</h2>
<fieldset class="label-display-options"><legend>显示方式</legend>
<label><input type="radio" name="multi-label-display" value="always" bind:group={value.labelDisplay} /><span><strong>始终显示</strong><small>头像与名字一直显示</small></span></label>
<label><input type="radio" name="multi-label-display" value="avatar" bind:group={value.labelDisplay} /><span><strong>仅显示头像</strong><small>悬停时展开名字</small></span></label>
<label><input type="radio" name="multi-label-display" value="hover" bind:group={value.labelDisplay} /><span><strong>全部隐藏</strong><small>悬停原位置时显示标签</small></span></label>
</fieldset>
<p class="help">立即预览，保存后保留，放弃更改时恢复。右键头像或名字可调画质，副屏还可更换直播间。</p>
<label class="option-row"><span><strong>标签集中到画面中间</strong><small>头像和音量入口贴近画面中间，名字向外排列。关闭后所有标签回到各自画面的左下角。</small></span><input type="checkbox" bind:checked={value.centerLabels} /></label></section>
<section><h2>增强选项</h2><div class="option-list"><label class="option-row"><span><strong>开启官方多屏增强</strong><small>补充入口与候选，点击开启后才加载额外画面；本地模式最多四屏。</small></span><input type="checkbox" bind:checked={value.enabled} /></label>
<label class="option-row"><span><strong>使用关注名单</strong><small>普通直播间读取完整关注列表，不修改关注关系。</small></span><input type="checkbox" bind:checked={value.useFollow} /></label>
<label class="option-row"><span><strong>独立控制各直播间音量</strong><small>关闭时，点击画面头像上的喇叭切换唯一发声房间，底部音量控制这一路。开启后悬停头像分别调节，底部音量作为总比例。</small></span><input type="checkbox" bind:checked={value.independentVolume} /></label>
<label class="option-row"><span><strong>紧凑选房</strong><small>两行 16:9 缩略图，内部纵向滚动，关闭恢复原生大图。</small></span><input type="checkbox" bind:checked={value.compact} /></label></div><p class="help">真实官方活动优先，其次使用团播名单或关注名单，再合并常用与临时候选。</p></section>
<section><h2>常用候选</h2><form onsubmit={event => { event.preventDefault(); void add(); }}><label class="edit-title" for="multi-custom-room">房间号或斗鱼直播间链接</label><div class="candidate-add"><input id="multi-custom-room" bind:value={input} placeholder="例如 6979222" /><button class="button" disabled={busy || !input.trim()}>{busy ? '读取中…' : '添加'}</button></div></form>
<ul class="room-grid">{#each value.custom as id (id)}{@const room = runtime.rooms.find(room => room.rid === id)}<li class="room-tile" title={`${room?.nn ?? `房间 ${id}`}（${id}）`}><RoomAvatar name={room?.nn ?? String(id)} src={room?.avt} offline={!!room && room.showStatus !== '1'} /><span class="room-name">{room?.nn ?? `房间 ${id}`}</span><small class="room-detail">{room ? room.showStatus === '1' ? '直播中' : '未开播' : '待更新'}</small><button class="room-remove" aria-label={`移除候选 ${id}`} onclick={() => { value.custom = value.custom.filter(room => room !== id); }}>×</button></li>{:else}<li class="help room-grid-empty">还没有常用候选。</li>{/each}</ul><p class="help">常用候选会出现在选房名单中，添加后不会自动播放。</p></section>
<section><h2>当前页面</h2><p class="status" role="status">{runtime.status}</p><div class="inline-actions"><button class="button" disabled={!runtime.ready} onclick={() => { void open(); }}>开启 / 编辑多屏</button><button class="button" disabled={!runtime.ready} onclick={() => { void multi.refresh(); }}>刷新候选</button></div><p class="help">右键主播头像或名字，可切换清晰度；副屏还可更换直播间并保留位置。主房间不能被移除；取消最后一个副屏恢复单屏。</p>{#if error}<p class="error" role="alert">{error}</p>{/if}</section>

<style>
  .label-display-options { display: flex; flex-wrap: wrap; gap: 8px; border: 0; padding: 0; margin: 0; min-width: 0; }
  .label-display-options legend { margin-bottom: 8px; font-size: 13px; }
  .label-display-options label { display: flex; flex: 1 1 128px; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; }
  .label-display-options label:has(input:checked) { border-color: var(--accent); background: var(--tint); }
  .label-display-options input { flex: none; margin: 0; accent-color: var(--accent); }
  .label-display-options strong, .label-display-options small { display: block; }
  .label-display-options strong { font-size: 13px; font-weight: 500; }
  .label-display-options small { margin-top: 3px; color: var(--muted); font-size: 12px; }
</style>
