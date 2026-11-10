export const signTasks = [
  { id: 'yuba', label: '鱼吧签到', help: '全部关注鱼吧，包含补签与失败重试。' },
  { id: 'client', label: '客户端签到', help: '自动领取每日签到奖励，显示连续与累计签到天数、剩余补签次数及最近日期。' },
  { id: 'fansHome', label: '粉丝家园签到', help: '为全部持有粉丝牌的房间逐一完成粉丝家园签到。' },
  { id: 'fanChat', label: '粉丝牌弹幕任务', help: '向未完成任务的持牌房间发送一条“.”；最多两路静默处理，完成后当天不再查询，北京时间零点后重新开始。' },
  { id: 'points', label: '任务中心积分', help: '顶部任务中心每日签到、领取已完成的观时积分。' },
  { id: 'level', label: '等级任务领奖', help: '只领取官方已确认完成的等级任务奖励。' },
  { id: 'readPosts', label: '随机阅读鱼吧帖子', help: '根据等级任务剩余次数读取不同鱼吧帖子，再检查阅读进度。' },
  { id: 'follow', label: '关注任务', help: '仅在官方任务未完成时临时关注未关注房间，随后取关。' },
  { id: 'star', label: '全民星推任务', help: '按活动要求为榜单房间签到；开启“关注任务”时，还会临时关注未关注的房间，随后取关。' },
  { id: 'starPacket', label: '自动领取星推荐红包', help: '每分钟检查当前房间，预计开抢前 2 秒开始连续抢领，最多两个请求同时发送；成功、抢完或明确失败即停止，最晚在开抢后 2 秒结束。' },
] as const;
export type SignTask = typeof signTasks[number]['id'];
export const clientRemedyChoice = { label: '自动补签', help: '签到后有漏签且剩余次数大于 0 时，一键补齐最近一周的漏签日期；首次签到跳过，关闭此项仍显示剩余次数。' };
export type SignOptions = Record<SignTask, boolean> & {
  enabled: boolean; clientRemedy: boolean; reminderEnabled: boolean; reminderTime: string;
};
export const signDefaults: SignOptions = {
  enabled: true, yuba: true, client: true, clientRemedy: true, fansHome: true, fanChat: true,
  points: true, level: true, readPosts: true, follow: true, star: true, starPacket: true,
  reminderEnabled: true, reminderTime: '23:50',
};
export function readSignOptions(input: unknown): SignOptions {
  if (input === undefined) return { ...signDefaults };
  if (!input || typeof input !== 'object') throw new Error('签到设置格式无效');
  const value = input as Record<string, unknown>, next = { ...signDefaults };
  for (const key of ['enabled', 'clientRemedy', 'reminderEnabled', ...signTasks.map(task => task.id)] as const) {
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
