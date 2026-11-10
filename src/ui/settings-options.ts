import type { BackpackOptions, PlaybackOptions, RoomOptions } from '../config/enhancements';
import type { BarrageOptions, OptimizationOptions } from '../config/options';

export const playbackChoices: { key: keyof PlaybackOptions; label: string; hint: string }[] = [
  { key: 'autoWebFullscreen', label: '自动网页全屏', hint: '直播开始后自动进入网页全屏；未开播或轮播时跳过，手动退出后本页不再自动进入。' },
  { key: 'highestQuality', label: '自动最高画质', hint: '播放器就绪后选择当前可用的最高画质；手动切换后，本页保留你的选择。' },
  { key: 'keepBackgroundVideo', label: '后台保持视频流', hint: '切到后台后继续接收视频流，避免回到前台时因切换音频模式而重载视频；后台流量高于纯音频模式。' },
  { key: 'volumeWheel', label: '原生音量滚轮', hint: '在播放器音量按钮或滑条上滚动，每格调整音量 5%。' },
];
export const layoutChoices: { key: keyof OptimizationOptions; label: string; hint: string }[] = [
  { key: 'hideTopBanner', label: '隐藏顶部大图', hint: '收起团播和普通直播间顶部的大图，包含带活动链接的主图；保留房间切换按钮。' },
  { key: 'hideRoomExtras', label: '隐藏直播间下方内容', hint: '隐藏播放器下方的视频精选、鱼吧等大块内容和页脚，保留播放器、聊天框与小工具。' },
  { key: 'hideGiftBar', label: '隐藏礼物栏', hint: '收起播放器下方礼物区域，保留原生控制栏。' },
  { key: 'collapseChat', label: '收起聊天活动区', hint: '拉高弹幕列表，保留贵宾 / 钻粉人数和恢复按钮。' },
  { key: 'autoHideHeader', label: '顶栏随滚动隐藏', hint: '仅在直播间向下滚动时收起顶栏，向上滚动一段距离后显示。' },
];
export const activityChoices: { key: keyof OptimizationOptions; label: string; hint: string }[] = [
  { key: 'hideAds', label: '隐藏页面广告', hint: '隐藏播放器、聊天区顶部、侧栏和搜索框中的广告位，保留原生播放与页面工具。' },
  { key: 'hidePk', label: '隐藏 PK 条', hint: '只隐藏 PK 展示，与礼物栏和活动浮窗分别控制。' },
  { key: 'hideActivities', label: '隐藏活动浮窗', hint: '隐藏右侧大航海、段位赛等轮播挂件及收起按钮。' },
];
export const reminderChoices: { key: 'closeRecommendation' | 'hideUnread'; label: string; hint: string }[] = [
  { key: 'closeRecommendation', label: '关闭关播推荐弹窗', hint: '出现原生关播推荐时调用其关闭按钮。' },
  { key: 'hideUnread', label: '隐藏消息角标', hint: '隐藏个人消息与私信的未读角标，保留消息入口和内容。' },
];
export const barrageMarks: { key: keyof BarrageOptions; label: string; hint: string }[] = [
  { key: 'fans', label: '隐藏粉丝牌', hint: '粉丝牌名称、等级和装饰，钻粉标记单独控制。' },
  { key: 'diamond', label: '隐藏钻粉标记', hint: '粉丝牌右侧的钻粉图标与开通月数。' },
  { key: 'noble', label: '隐藏贵族 / 至尊标记', hint: '贵族图标、至尊图标和昵称旁的头衔。' },
  { key: 'level', label: '隐藏等级标记', hint: '用户等级、主播等级与房间等级。' },
  { key: 'other', label: '隐藏其他前缀标记', hint: '房管身份、荣誉勋章、座驾、成就与赛事标记。' },
  { key: 'suffix', label: '隐藏弹幕后缀', hint: '正文后的活动附加文字、礼包链接与设备来源。' },
];
export const roomChoices: { key: keyof RoomOptions; label: string; hint: string }[] = [
  { key: 'duration', label: '本场开播时长', hint: '在主播信息旁显示已播时长，轮播与离线房间不显示成本场直播。' },
  { key: 'guild', label: '主播公会', hint: '在主播信息旁显示公会名称。' },
  { key: 'lastLive', label: '上次开播时间', hint: '离线时显示最近一次开播时间。' },
];
export const backpackChoices: { key: Exclude<keyof BackpackOptions, 'glowCount'>; label: string; hint: string }[] = [
  { key: 'details', label: '背包详情', hint: '显示背包道具的到期天数、总价值和可提供的亲密度。' },
  { key: 'monthCost', label: '月消费统计', hint: '在鱼丸左侧显示本月消费，按账号每天汇总；金额默认隐藏，点击眼睛查看。' },
  { key: 'vipExpiry', label: '房间 VIP 到期提示', hint: '显示当前房间 VIP 剩余天数。' },
  { key: 'badgeDays', label: '粉丝牌持有天数', hint: '在设置和个人中心牌表中显示持有天数，保留获得日期，牌表满 300 天突出显示。' },
  { key: 'chatBadgeDays', label: '聊天区牌龄', hint: '在聊天工具栏显示本房粉丝牌持有天数，悬停查看获得日期。' },
  { key: 'pocket', label: '主播口袋', hint: '显示主播当前生效的口袋道具，并补充到原生粉丝牌面板。' },
  { key: 'glow', label: '荧光棒续牌', hint: '充值旁显示续牌按钮；打开后列出背包库存和持牌房间，点击“确认赠送”后逐房赠送。' },
];
