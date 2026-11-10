import type { ClientSignApi, ClientSignStatus } from '../../adapters/douyu/client-sign';

export interface ClientProgress extends ClientSignStatus { remaining?: number; remedy: string; remedyChecked: boolean; rewards: string }

export function clientSignDetail(value: ClientProgress) {
  const remaining = value.remaining === undefined ? '补签次数待读取' : `剩余补签 ${value.remaining} 次`;
  return `连续签到第 ${value.days} 天 · 累计签到 ${value.totalDays} 天 · ${remaining} · 最近签到 ${value.signedOn}${value.rewards ? `；${value.rewards}` : ''}${value.remedy ? `；${value.remedy}` : ''}`;
}

export async function runClientSign(api: ClientSignApi, day: string, autoRemedy: () => boolean, current: () => void,
  update: (value: ClientProgress) => void) {
  let status = await api.status(); current();
  let rewards = '';
  if (status.signedOn !== day) {
    rewards = (await api.sign()).rewards; current();
    status = await api.status(); current();
    if (status.signedOn !== day) throw new Error('官方尚未确认客户端今日签到');
  }
  const progress: ClientProgress = { ...status, rewards, remedy: '', remedyChecked: false };
  const publish = () => update({ ...progress });
  publish();
  const before = await api.remedyStatus(); current();
  if (before.signedOn !== day) throw new Error('补签状态尚未同步今日签到');
  progress.remaining = before.remaining;
  publish();
  if (!autoRemedy()) { progress.remedy = '自动补签已关闭'; publish(); return; }
  if (status.totalDays <= 1) {
    progress.remedy = '首次签到，无需补签'; progress.remedyChecked = true; publish(); return;
  }
  if (!before.missedDays || !before.remaining) {
    progress.remedy = before.missedDays ? `漏签 ${before.missedDays} 天，暂无可用补签次数` : '无漏签';
    progress.remedyChecked = true; publish(); return;
  }
  if (!autoRemedy()) { progress.remedy = '自动补签已关闭'; publish(); return; }
  const missing = before.calendar.filter(item => !item.signed);
  if (!missing.length) throw new Error('官方漏签天数与补签日历不一致');
  await api.remedy(); current();
  const after = await api.remedyStatus(); current();
  if (after.signedOn !== day || after.remaining >= before.remaining || after.missedDays !== 0
    || missing.some(item => !after.calendar.some(next => next.date === item.date && next.signed))) throw new Error('官方尚未确认漏签日期已补齐');
  status = await api.status(); current();
  if (status.signedOn !== day) throw new Error('补签后的签到状态尚未同步');
  Object.assign(progress, status, { remaining: after.remaining, remedy: `已补齐 ${before.missedDays} 天漏签`, remedyChecked: true });
  publish();
}
