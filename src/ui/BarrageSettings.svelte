<script lang="ts">
  import type { BarrageOptions } from '../config/options';
  let { value = $bindable() }: { value: BarrageOptions } = $props();
  const marks: { key: keyof BarrageOptions; label: string; hint: string }[] = [
    { key: 'fans', label: '隐藏粉丝牌', hint: '粉丝牌名称、等级和装饰，钻粉标记单独控制。' },
    { key: 'diamond', label: '隐藏钻粉标记', hint: '粉丝牌右侧的钻粉图标与开通月数。' },
    { key: 'noble', label: '隐藏贵族 / 至尊标记', hint: '贵族图标、至尊图标和昵称旁的头衔。' },
    { key: 'level', label: '隐藏等级标记', hint: '用户等级、主播等级与房间等级。' },
    { key: 'other', label: '隐藏其他前缀标记', hint: '房管身份、荣誉勋章、座驾、成就与赛事标记。' },
    { key: 'suffix', label: '隐藏弹幕后缀', hint: '正文后的活动附加文字、礼包链接与设备来源。' },
  ];
</script>

<h1>弹幕</h1><p class="intro">保留聊天正文，按需收起多余标记。</p>
<section><h2>标记与装饰</h2><div class="option-list">{#each marks as mark (mark.key)}<label class="option-row"><span><strong>{mark.label}</strong><small>{mark.hint}</small></span><input type="checkbox" bind:checked={value[mark.key]} /></label>{/each}</div></section>
<section><h2>消息过滤</h2><div class="option-list"><label class="option-row"><span><strong>隐藏进场提示</strong><small>隐藏聊天区底部“谁谁谁来了”的提示，进场特效另在优化中控制。</small></span><input type="checkbox" bind:checked={value.enter} /></label><label class="option-row"><span><strong>隐藏活动 / 带链接的弹幕</strong><small>整条活动或链接消息不显示，粉丝牌链接不在此范围内。</small></span><input type="checkbox" bind:checked={value.linked} /></label></div></section>
