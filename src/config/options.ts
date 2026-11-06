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
  fans: false,
  diamond: false,
  noble: false,
  level: false,
  other: false,
  suffix: false,
  linked: false,
  enter: true,
};

export const nativeShieldDefaults = {
  allGift: false,
  message: true,
  videoBroadcast: true,
  smallGift: true,
  userEnter: true,
  audioGift: true,
  barrageSkin: true,
};

export type NativeShieldOptions = typeof nativeShieldDefaults;
export const nativeShieldChoices: { key: keyof NativeShieldOptions; label: string }[] = [
  { key: 'allGift', label: '屏蔽全部礼物' },
  { key: 'message', label: '屏蔽消息通知' },
  { key: 'videoBroadcast', label: '屏蔽视频广播' },
  { key: 'smallGift', label: '屏蔽小礼物' },
  { key: 'userEnter', label: '屏蔽进场特效' },
  { key: 'audioGift', label: '屏蔽礼物音效' },
  { key: 'barrageSkin', label: '屏蔽弹幕皮肤' },
];

export type OptimizationOptions = typeof optimizationDefaults;
export type BarrageOptions = typeof barrageDefaults;

export function readOptions<T extends Record<string, boolean>>(input: unknown, defaults: T): T {
  if (input === undefined) return { ...defaults };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('优化设置格式无效');
  const value = input as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'boolean') throw new Error('优化设置需要使用开关值');
    result[key] = value[key] as T[keyof T & string];
  }
  return result;
}
