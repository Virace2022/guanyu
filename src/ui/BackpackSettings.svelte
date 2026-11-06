<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { BackpackOptions } from '../config/enhancements';
  import type { BackpackController } from '../features/backpack/controller';
  let { value = $bindable(), backpack }: { value: BackpackOptions; backpack: BackpackController } = $props();
  let runtime = $state(untrack(() => backpack.value));
  const choices: { key: Exclude<keyof BackpackOptions, 'glowCount'>; label: string; hint: string }[] = [
    { key: 'details', label: '背包详情', hint: '在原生背包显示到期天数、总价值和道具总亲密度。' },
    { key: 'monthCost', label: '月消费统计', hint: '在鱼丸左侧显示本月消费，读取个人中心真实数据，按账号每日缓存汇总。' },
    { key: 'vipExpiry', label: '房间 VIP 到期提示', hint: '显示当前房间 VIP 剩余天数。' },
    { key: 'badgeDays', label: '粉丝牌持有天数', hint: '在聊天工具栏显示本房牌龄，名单中保留获得日期，满 300 天突出显示。' },
    { key: 'pocket', label: '主播口袋', hint: '显示主播当前生效的口袋道具，并补充到原生粉丝牌面板。' },
    { key: 'glow', label: '荧光棒续牌', hint: '充值旁提供快捷入口，从背包生成完整计划后手动确认赠送。' },
  ];
  onMount(() => backpack.subscribe(next => { runtime = next; }));
</script>
<h1>背包增强</h1><p class="intro">沿用原生背包，集中查看道具、消费与粉丝牌信息。</p>
<section><h2>增强选项</h2><div class="option-list">{#each choices as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" bind:checked={value[choice.key]} /></label>{/each}</div><p class="help">保存后应用，下方数据与操作使用已保存的设置。</p></section>
<section><h2>当前账户与房间</h2><button class="button" disabled={runtime.loading || runtime.sending} onclick={() => { void backpack.refresh(); }}>{runtime.loading ? '读取中…' : '刷新资料'}</button>
{#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
{#if value.monthCost}<p>本月消费：{runtime.month ? `¥${(runtime.month.total / 100).toFixed(2)}` : '保存并读取后显示'}</p>{#if runtime.month}<ul>{#each runtime.month.details as item}<li>{item.name}：¥{(item.amount / 100).toFixed(2)}</li>{/each}</ul>{/if}{/if}
{#if value.vipExpiry}<p>本房 VIP：{runtime.vipDays === null ? '未读取到本房 VIP 权益' : `剩余 ${runtime.vipDays} 天`}</p>{/if}
{#if value.pocket}<p>主播口袋：{runtime.pocket.map(item => item.name).join('、') || '当前没有生效道具'}</p>{/if}
{#if value.details}<div class="data-scroll"><table><thead><tr><th>背包道具</th><th>数量</th><th>到期时间</th></tr></thead><tbody>{#each runtime.gifts as gift (gift.id)}<tr><td>{gift.name}</td><td>{gift.count}</td><td>{Number(gift.met) > 0 ? new Date(Number(gift.met) * 1000).toLocaleString() : '长期'}</td></tr>{:else}<tr><td colspan="3">尚未读取到背包道具。</td></tr>{/each}</tbody></table></div>{/if}
{#if value.badgeDays}<div class="data-scroll"><table><thead><tr><th>粉丝牌房间</th><th>获得时间</th><th>持有天数</th></tr></thead><tbody>{#each runtime.badges as badge (badge.id)}<tr><td><a href={`https://www.douyu.com/${badge.id}`} target="_blank" rel="noopener">{badge.name}</a></td><td>{badge.since > 0 ? new Date(badge.since).toLocaleDateString() : '未提供'}</td><td>{badge.days} 天</td></tr>{/each}</tbody></table></div>{/if}
</section>
<section><h2>荧光棒续牌</h2><label class="setting-row" for="guanyu-glow-count"><span>每个房间赠送</span><input id="guanyu-glow-count" type="number" min="0" max="100000" step="1" bind:value={value.glowCount} /><span>根</span></label><p class="help">0 表示把同一种荧光棒平均分配到全部粉丝牌房间。数量保存后使用，不自动执行。</p><div class="inline-actions"><button class="button" disabled={runtime.loading || runtime.sending || !value.glow} onclick={() => { void backpack.prepare(); }}>生成赠送计划</button>{#if runtime.plan}<button class="button" disabled={runtime.sending || runtime.loading} onclick={() => { void backpack.send(); }}>确认并赠送 {runtime.plan.total} 根</button>{/if}</div>
{#if runtime.plan}<p>{runtime.plan.name}，库存 {runtime.plan.available} 根；每房 {runtime.plan.each} 根，共 {runtime.plan.rooms.length} 个房间，合计 {runtime.plan.total} 根。</p><p class="help">目标：{runtime.plan.rooms.map(room => `${room.name}（${room.id}）`).join('、')}</p>{/if}
{#if runtime.sending}<p class="status" role="status">正在按计划赠送…</p>{/if}{#if runtime.results.length}<ul>{#each runtime.results as result}<li>{result}</li>{/each}</ul>{/if}
</section>
