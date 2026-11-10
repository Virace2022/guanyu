export type SettingsSection = 'general' | 'optimization' | 'barrage' | 'sound' | 'team' | 'multi' | 'menu' | 'sign' | 'playback' | 'room' | 'backpack';

export const settingsSections: { id: SettingsSection; label: string; groupStart?: boolean }[] = [
  { id: 'playback', label: '播放' },
  { id: 'sound', label: '声音' },
  { id: 'optimization', label: '页面整理' },
  { id: 'barrage', label: '弹幕与特效' },
  { id: 'team', label: '团播' },
  { id: 'multi', label: '多屏' },
  { id: 'room', label: '房间信息', groupStart: true },
  { id: 'backpack', label: '背包与权益' },
  { id: 'sign', label: '每日任务' },
  { id: 'menu', label: '右键菜单', groupStart: true },
  { id: 'general', label: '通用' },
];
