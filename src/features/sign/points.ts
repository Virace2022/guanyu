import type { DouyuTasks } from '../../adapters/douyu/tasks';

export async function checkPoints(api: Pick<DouyuTasks, 'pointsSign' | 'viewRewards'>, current: () => void) {
  let signed = false, count = 0;
  const errors: string[] = [];
  try { await api.pointsSign(); current(); signed = true; }
  catch (cause: any) { if (cause.interrupted) throw cause; current(); errors.push(`签到：${cause.message || String(cause)}`); }
  try { count = await api.viewRewards(); current(); }
  catch (cause: any) { if (cause.interrupted) throw cause; current(); errors.push(`观时积分：${cause.message || String(cause)}`); }
  const detail = [signed ? '今日签到已确认' : '', count ? `本轮已确认领取 ${count} 档观时积分` : errors.some(error => error.startsWith('观时积分：')) ? '' : '本轮无可领取观时积分', ...errors].filter(Boolean).join('；');
  return { signed, detail, failed: errors.length > 0 };
}
