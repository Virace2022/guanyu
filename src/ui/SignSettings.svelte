<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { signTasks, type SignOptions } from '../config/sign';
  import type { SignController } from '../features/sign/feature';
  let { value = $bindable(), sign }: { value: SignOptions; sign: SignController } = $props();
  let runtime = $state(untrack(() => sign.value));
  onMount(() => sign.subscribe(next => { runtime = next; }));
  const statusName = { pending: '等待', done: '完成', waiting: '待检查', error: '重试中', disabled: '已关闭' };
</script>

<h1>签到</h1>
<p class="intro">按当前账号完成每日签到，读取官方任务进度并领取已完成的奖励。</p>
<section>
  <h2>自动处理</h2>
  <div class="option-list">
  <label class="option-row"><span><strong>自动签到与每日任务</strong><small>同账号多个页面共用一份任务，关闭窗口后继续运行，按北京时间换日；请求间隔 3～5 秒。</small></span><input type="checkbox" bind:checked={value.enabled} /></label>
  {#each signTasks as task (task.id)}
    <label class="option-row"><span><strong>{task.label}</strong><small>{task.help}</small></span><input type="checkbox" bind:checked={value[task.id]} disabled={!value.enabled} /></label>
  {/each}
  </div>
  <p class="help">关注任务只临时关注原本未关注的房间，随后取关；已有关注保留。</p>
</section>
<section>
  <h2>鱼吧未完成提醒</h2>
  <label class="option-row"><span><strong>晚间提醒</strong><small>到时仍未完成且已有失败记录时提醒，每账号每天一次；关闭提醒仍会自动重试。</small></span><input type="checkbox" bind:checked={value.reminderEnabled} disabled={!value.enabled || !value.yuba} /></label>
  <label class="setting-row" for="sign-reminder-time"><span>提醒时间（北京时间）</span><input id="sign-reminder-time" type="time" step="60" bind:value={value.reminderTime} disabled={!value.reminderEnabled || !value.enabled || !value.yuba} /></label>
</section>
<section>
  <h2>当前房间的星推荐红包</h2>
  <p class="status" role="status">{runtime.packet.status}</p>
  <button class="button" disabled={!runtime.packet.available} onclick={sign.openPacket}>查看官方红包面板</button>
  <p class="help">按官方事件识别，颜色不影响判断；活动未出现时不发请求。窄窗口可能隐藏原生入口。</p>
</section>
<section>
  <h2>今日进度</h2>
  <p class="help">{runtime.uid ? `账号 ${runtime.uid} · 北京时间 ${runtime.day}` : '登录斗鱼后自动读取进度。'}</p>
  <div class="inline-actions"><button class="button" disabled={!runtime.uid || runtime.running} onclick={() => { void sign.run(); }}>{runtime.running ? '正在处理…' : '立即检查与重试'}</button><a class="button" href="https://www.douyu.com/pages/ord-task-center?clientType=web" target="_blank" rel="noreferrer">打开官方任务中心</a></div>
  {#if runtime.notice}<p class="status" role="status">{runtime.notice}</p>{/if}
  {#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
  {#if runtime.restore}<p class="error" role="alert">{runtime.restore}；恢复操作优先于其他任务。</p>{/if}
  <div class="sign-progress" aria-live="polite">
    {#each runtime.rows as row (row.id)}
      <div class="sign-progress-row"><div><strong>{row.label}</strong><span class:error-text={row.status === 'error'}>{statusName[row.status]}</span></div><p>{row.detail}</p></div>
    {/each}
  </div>
  {#if runtime.yubaDetails.length}<details><summary>鱼吧未完成与补签详情（{runtime.yubaDetails.length}）</summary><ul class="sign-details">{#each runtime.yubaDetails as detail}<li>{detail}</li>{/each}</ul></details>{/if}
  {#if runtime.tasks.length}
    <details><summary>官方等级任务（{runtime.tasks.length}）</summary><ul class="sign-details">{#each runtime.tasks as task (task.taskId)}<li>{task.name}：{task.cur} / {task.max} · {task.prizeStatus === 1 ? '已领奖' : task.taskStatus === 1 ? '待领奖' : '未完成'}</li>{/each}</ul></details>
  {/if}
</section>

<style>
  .sign-progress { margin-block: 16px; }
  .sign-progress-row { padding-block: 12px; border-bottom: 1px solid var(--line); }
  .sign-progress-row > div { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .sign-progress-row p { margin: 6px 0 0; line-height: 1.6; overflow-wrap: anywhere; }
  .sign-progress-row span { flex-shrink: 0; }
  .error-text { color: var(--danger); }
  .sign-details { padding-left: 20px; line-height: 1.7; overflow-wrap: anywhere; }
  details + details { margin-top: 12px; }
  summary { cursor: pointer; }
</style>
