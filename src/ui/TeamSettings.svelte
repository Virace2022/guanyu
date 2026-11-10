<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { TeamOptions } from '../config/team';
  import type { TeamController } from '../features/team-live/controller';
  import { toggleTeamPreview } from './team-preview';
  let { value = $bindable(), team, openEditor, roomId }: { value: TeamOptions; team: TeamController; openEditor: () => void; roomId: string } = $props();
  let runtime = $state(untrack(() => team.value));
  onMount(() => team.subscribe(next => { runtime = next; }));
  async function preview() {
    await toggleTeamPreview(team, roomId, openEditor);
  }
</script>
<h1>团播</h1><p class="intro">按活动组织名单，按需开启静音预览。</p>
<section><h2>当前活动</h2>
  {#if runtime.candidate}
    <p class="help">{runtime.candidate.pageId ? `活动 ${runtime.candidate.pageId}` : '按房间集合识别'} · {runtime.candidate.rooms.length} 个房间</p>
    <label class="setting-row" for="team-detection"><span>活动处理</span><select id="team-detection" value={runtime.detection} onchange={event => team.setDetection(event.currentTarget.value as 'auto' | 'include' | 'exclude')}><option value="auto">自动识别</option><option value="include">作为团播使用</option><option value="exclude">排除此活动</option></select></label>
    <p class="help">此选择按活动保存。识别为赛事主 / 副舞台的活动会自动排除；选择“作为团播使用”可手动启用。</p>
    {#if !runtime.source}<p class="status">当前活动已排除，原生链接和布局保留。</p>{/if}
    <div class="inline-actions"><button class="button" disabled={!runtime.source} onclick={openEditor}>编辑名单</button><button class="button" disabled={!runtime.source || runtime.refreshing} onclick={() => { void team.refreshStatus(); }}>{runtime.refreshing ? '刷新中…' : '刷新开播状态'}</button><button class="button" disabled={!runtime.source} onclick={() => { void preview(); }}>{runtime.preview ? '关闭预览' : '开启静音预览'}</button></div>
    {#if runtime.statusError}<p class="error" role="status">{runtime.statusError}</p>{:else if runtime.lastRefresh}<p class="status">开播状态更新于 {new Date(runtime.lastRefresh).toLocaleTimeString()}</p>{/if}
  {:else}<p class="help">当前页面尚未检测到活动名单，活动卡片加载后会自动识别。</p>{/if}
</section>
<section><h2>布局与入口</h2>
<label class="option-row"><span><strong>显示右侧团播工具条</strong><small>点击小鱼展开，按住小鱼可沿右侧上下拖动；隐藏后仍可从设置打开名单。</small></span><input type="checkbox" data-setting="team.showToolbar" bind:checked={value.showToolbar} /></label>
<label class="setting-row" for="team-columns"><span>队伍列数</span><select id="team-columns" bind:value={value.teamColumns}><option value={0}>自动适应</option>{#each [1,2,3,4,5,6] as count}<option value={count}>{count} 列</option>{/each}</select></label>
<label class="setting-row" for="team-member-layout"><span>队员卡片布局</span><select id="team-member-layout" bind:value={value.columnsMode} onchange={event => { value.columns = event.currentTarget.value === 'fixed' ? value.columns || 3 : 0; }}><option value="auto">按人数自动编排</option><option value="native">保留原卡片尺寸</option><option value="fixed">固定队员列数</option></select></label>
{#if value.columnsMode === 'fixed'}<label class="setting-row" for="member-columns"><span>队员列数</span><select id="member-columns" bind:value={value.columns}>{#each [1,2,3,4,5,6,8,10,12] as count}<option value={count}>{count} 列</option>{/each}</select></label>{/if}
<p class="help">自动编排同时考虑队伍数、人数和宽度：少队横向展开，多队少人并排，多队多人纵向展开。原尺寸模式只在放不下时换行，队长独立显示。</p>
<label class="setting-row" for="team-alignment"><span>排列对齐</span><select id="team-alignment" bind:value={value.alignment}><option value="left">靠左</option><option value="center">居中</option><option value="right">靠右</option></select></label>
<p class="help">顶部大图使用“页面整理 → 隐藏顶部大图”，同时覆盖团播和普通活动。</p>
<label class="option-row"><span><strong>跟随播放器与聊天区宽度</strong><small>让团播名单与播放器、聊天区整体等宽。</small></span><input type="checkbox" data-setting="team.originalWidth" bind:checked={value.originalWidth} /></label></section>
<section><h2>状态刷新与预览</h2><label class="option-row"><span><strong>自动刷新开播状态</strong><small>按下方间隔更新成员是否开播；已编排的分组与成员保留。</small></span><input type="checkbox" data-setting="team.autoRefresh" bind:checked={value.autoRefresh} /></label>
<label class="setting-row" for="team-refresh"><span>刷新间隔</span><select id="team-refresh" bind:value={value.refreshSeconds}>{#each [30,60,120,300] as seconds}<option value={seconds}>{seconds} 秒</option>{/each}</select></label>
<label class="setting-row" for="preview-source"><span>预览来源</span><select id="preview-source" bind:value={value.previewSource}><option value="lowest">优先最低画质，失败回退原生</option><option value="native">原生预览</option></select></label>
<label class="setting-row" for="preview-retry"><span>失败自动重试</span><select id="preview-retry" bind:value={value.previewRetrySeconds}>{#each [0,30,60,120,300] as seconds}<option value={seconds}>{seconds ? `${seconds} 秒` : '关闭'}</option>{/each}</select></label>
<label class="option-row"><span><strong>放大时切换高清原声</strong><small>放大后获取高清画面并开启声音；获取失败时继续静音预览，还原后立即静音。</small></span><input type="checkbox" data-setting="team.previewFocusOriginal" bind:checked={value.previewFocusOriginal} /></label>
<p class="help">预览属于娱乐功能。双击放大或还原，各队互不影响；后台和全屏会暂停预览。预览开关仅本页有效。</p></section>
