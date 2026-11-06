export const signTasks = [
  { id: 'yuba', label: '鱼吧签到', help: '全部关注鱼吧，包含补签与失败重试。' },
  { id: 'client', label: '客户端签到', help: '领取客户端每日签到奖励。' },
  { id: 'fansHome', label: '粉丝家园签到', help: '读取真实粉丝牌名单，逐房间处理。' },
  { id: 'points', label: '任务中心积分', help: '顶部任务中心每日签到、领取已完成的观时积分。' },
  { id: 'level', label: '等级任务领奖', help: '只领取官方已确认完成的等级任务奖励。' },
  { id: 'readPosts', label: '随机阅读鱼吧帖子', help: '从真实鱼吧内容随机选择不同帖子，按等级任务剩余数量处理。' },
  { id: 'follow', label: '关注任务', help: '仅在官方任务未完成时临时关注未关注房间，随后取关。' },
  { id: 'star', label: '全民星推任务', help: '读取当前官方星推任务，保留签到与关注任务。' },
] as const;
export type SignTask = typeof signTasks[number]['id'];
export type SignOptions = Record<SignTask, boolean> & {
  enabled: boolean; reminderEnabled: boolean; reminderTime: string;
};
export const signDefaults: SignOptions = {
  enabled: true, yuba: true, client: true, fansHome: true,
  points: true, level: true, readPosts: true, follow: true, star: true,
  reminderEnabled: true, reminderTime: '23:50',
};
export function readSignOptions(input: unknown): SignOptions {
  if (input === undefined) return { ...signDefaults };
  if (!input || typeof input !== 'object') throw new Error('签到设置格式无效');
  const value = input as Record<string, unknown>, next = { ...signDefaults };
  for (const key of ['enabled', 'reminderEnabled', ...signTasks.map(task => task.id)] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'boolean') throw new Error('签到开关格式无效');
    next[key] = value[key];
  }
  if (value.reminderTime !== undefined) {
    if (typeof value.reminderTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime)) throw new Error('提醒时间格式无效');
    next.reminderTime = value.reminderTime;
  }
  return next;
}
