export const optimizationDefaults = {
  hideAds: true,
  hideTopBanner: true,
  hideRoomExtras: true,
  hideGiftBar: true,
  hidePk: true,
  hideActivities: true,
  collapseChat: true,
  autoHideHeader: true,
};

export const barrageDefaults = {
  fans: true,
  diamond: true,
  noble: true,
  level: true,
  other: true,
  suffix: true,
  linked: true,
  enter: true,
};

export const nativeShieldDefaults = {
  allGift: true,
  message: true,
  videoBroadcast: true,
  smallGift: true,
  userEnter: true,
  audioGift: true,
  barrageSkin: true,
};

export type NativeShieldOptions = typeof nativeShieldDefaults;
export const nativeShieldChoices: { key: keyof NativeShieldOptions; label: string; hint: string }[] = [
  { key: 'allGift', label: '屏蔽全部礼物', hint: '屏蔽播放器内的礼物展示；下方送礼区域由“页面整理 → 隐藏礼物栏”控制。' },
  { key: 'message', label: '屏蔽消息通知', hint: '屏蔽斗鱼原生消息通知；聊天中的活动或链接消息在“消息过滤”中设置。' },
  { key: 'videoBroadcast', label: '屏蔽视频广播', hint: '单独屏蔽斗鱼的视频广播，与礼物展示、进场特效分别控制。' },
  { key: 'smallGift', label: '屏蔽小礼物', hint: '屏蔽小礼物展示，可与“屏蔽全部礼物”分别设置。' },
  { key: 'userEnter', label: '屏蔽进场特效', hint: '屏蔽用户进场动画；“谁谁谁来了”的文字提示在“消息过滤”中设置。' },
  { key: 'audioGift', label: '屏蔽礼物音效', hint: '屏蔽礼物播放时的音效；直播声音与额外增益在“声音”中设置。' },
  { key: 'barrageSkin', label: '屏蔽弹幕皮肤', hint: '屏蔽弹幕皮肤装饰；粉丝牌、等级等标记在“标记与装饰”中设置。' },
];

export type OptimizationOptions = typeof optimizationDefaults;
export type BarrageOptions = typeof barrageDefaults;

export function readOptions<T extends Record<string, boolean>>(input: unknown, defaults: T): T {
  if (input === undefined) return { ...defaults };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('页面整理设置格式无效');
  const value = input as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'boolean') throw new Error('页面整理设置需要使用开关值');
    result[key] = value[key] as T[keyof T & string];
  }
  return result;
}
