type Status = 'ready' | 'applied' | 'waiting' | 'idle' | 'unmatched' | 'error';
interface Entry { category: string; name: string; enabled: boolean; results: Map<string, string> }
const entries = new Map<string, Entry>();
const labels: Record<Status, string> = { ready: '已就绪', applied: '已生效', waiting: '等待中', idle: '待触发 / 不适用', unmatched: '未匹配', error: '执行失败' };
let running = false;

export const diagnostics = {
  start(version: string) {
    entries.clear(); running = true;
    console.info(`%c><(((°>  观鱼 v${version}\n脚本已加载，功能日志随实际运行输出；控制台筛选「观鱼」可查看。`, 'color:#ff5d23;font-weight:bold');
  },
  enable(id: string, category: string, name: string, enabled = true) {
    if (!running) return;
    const previous = entries.get(id);
    if (previous?.enabled === enabled) return;
    entries.set(id, { category, name, enabled, results: new Map() });
    if (enabled || previous?.enabled) console.info(`[观鱼][${category}][${name}] ${enabled ? '已开启' : '已关闭'}`);
  },
  report(id: string, status: Status, detail: string, stage = '适配') {
    const entry = entries.get(id);
    if (!running || !entry?.enabled) return;
    const signature = `${status}:${detail}`;
    if (entry.results.get(stage) === signature) return;
    entry.results.set(stage, signature);
    const message = `[观鱼][${entry.category}][${entry.name}][${stage}] ${labels[status]}：${detail}`;
    if (status === 'error') console.error(message);
    else console.info(message);
  },
  failure(scope: string, cause: unknown) {
    console.error(`[观鱼][${scope}] 执行失败：${cause instanceof Error ? cause.message : String(cause)}`);
  },
  stop() { running = false; entries.clear(); },
};
