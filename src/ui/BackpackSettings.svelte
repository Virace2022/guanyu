<script lang="ts">
  import { backpackChoices as choices } from './settings-options';
  import { onMount, untrack } from 'svelte';
  import type { BackpackOptions } from '../config/enhancements';
  import type { BackpackController } from '../features/backpack/controller';
  import RoomAvatar from './RoomAvatar.svelte';
  let { value = $bindable(), backpack, onNavigate, validationError = '' }: { value: BackpackOptions; backpack: BackpackController; onNavigate: () => void; validationError?: string } = $props();
  let runtime = $state(untrack(() => backpack.value));

  onMount(() => backpack.subscribe(next => { runtime = next; }));
</script>
{#snippet options(keys: (keyof BackpackOptions)[])}
<div class="option-list">{#each choices.filter(choice => keys.includes(choice.key)) as choice (choice.key)}<label class="option-row"><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><input type="checkbox" data-setting={`backpack.${choice.key}`} bind:checked={value[choice.key]} /></label>{/each}</div>
{/snippet}

<h1>背包与权益</h1><p class="intro">查看道具、消费和粉丝牌资料，按需手动续牌。</p>
<div class="inline-actions"><button class="button" disabled={runtime.loading || runtime.sending} onclick={() => { void backpack.refresh(); }}>{runtime.loading ? '读取中…' : '刷新资料'}</button></div>
{#if runtime.error}<p class="error" role="alert">{runtime.error}</p>{/if}
<section><h2>道具与消费</h2>
{@render options(['details', 'monthCost'])}
{#if value.monthCost}<p>本月消费：{runtime.month ? `¥${(runtime.month.total / 100).toFixed(2)}` : '保存并读取后显示'}</p>{#if runtime.month}<ul>{#each runtime.month.details as item}<li>{item.name}：¥{(item.amount / 100).toFixed(2)}</li>{/each}</ul>{/if}{/if}
{#if value.details}<div class="data-scroll"><table><thead><tr><th>背包道具</th><th>数量</th><th>到期时间</th></tr></thead><tbody>{#each runtime.gifts as gift (gift.id)}<tr><td>{gift.name}</td><td>{gift.count}</td><td>{Number(gift.met) > 0 ? new Date(Number(gift.met) * 1000).toLocaleString() : '长期'}</td></tr>{:else}<tr><td colspan="3">尚未读取到背包道具。</td></tr>{/each}</tbody></table></div>{/if}
</section>
<section><h2>粉丝牌与房间权益</h2>
{@render options(['vipExpiry', 'badgeDays', 'chatBadgeDays', 'pocket'])}
{#if value.vipExpiry}<p>本房 VIP：{runtime.vipDays === null ? '未读取到本房 VIP 权益' : `剩余 ${runtime.vipDays} 天`}</p>{/if}
{#if value.pocket}<p>主播口袋：{runtime.pocket.map(item => item.name).join('、') || '当前没有生效道具'}</p>{/if}
{#if value.badgeDays}<h3>粉丝牌房间</h3><ul class="room-grid">{#each runtime.badges as badge (badge.id)}<li><a class="room-tile" href={`https://www.douyu.com/${badge.id}`} target="_blank" rel="noopener" title={`${badge.name}（${badge.id}）· 持有 ${badge.days} 天 · 获得于 ${badge.since > 0 ? new Date(badge.since).toLocaleDateString() : '未提供'}`}><RoomAvatar name={badge.name} src={badge.avatar} /><span class="room-name">{badge.name}</span><small class="room-detail">{badge.days} 天</small></a></li>{:else}<li class="help room-grid-empty">尚未读取到粉丝牌房间。</li>{/each}</ul>{#if runtime.avatarError}<p class="help">{runtime.avatarError}</p>{/if}{/if}
</section>
<section><h2>荧光棒续牌</h2>
{@render options(['glow'])}
<label class="setting-row" for="guanyu-glow-count"><span>默认每房赠送</span><input id="guanyu-glow-count" type="number" min="0" max="100000" step="1" bind:value={value.glowCount} /><span>根</span></label><p class="help">填 0 时，将同一种荧光棒平均分配到全部粉丝牌房间。</p><button class="button" disabled={!runtime.sending && !value.glow} onclick={onNavigate}>打开荧光棒续牌</button>
{#if validationError}<p id="settings-field-error" class="error" role="alert">{validationError}</p>{/if}
{#if !value.glow && !runtime.sending}<p class="help">荧光棒续牌已关闭，勾选上方开关后保存即可使用。</p>{/if}
</section>
