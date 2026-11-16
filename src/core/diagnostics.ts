type Status = 'ready' | 'applied' | 'waiting' | 'idle' | 'unmatched' | 'error';
interface Entry { category: string; name: string; enabled: boolean; results: Map<string, string> }
export interface DiagnosticError { key: string; id: string; category: string; name: string; stage: string; detail: string; dismissed: boolean }
const entries = new Map<string, Entry>();
const errors = new Map<string, DiagnosticError>();
const listeners = new Set<(value: DiagnosticError[]) => void>();
const labels: Record<Status, string> = { ready: '已就绪', applied: '已生效', waiting: '等待中', idle: '待触发 / 不适用', unmatched: '未匹配', error: '执行失败' };
let running = false;
let verbose = false;

function publishErrors() {
  const value = [...errors.values()].filter(item => !item.dismissed);
  for (const listener of listeners) listener(value);
}

function reportError(id: string, category: string, name: string, stage: string, detail: string) {
  const key = `${id}:${stage}`;
  if (errors.get(key)?.detail === detail) return;
  errors.set(key, { key, id, category, name, stage, detail, dismissed: false });
  publishErrors();
}

export const diagnostics = {
  start(version: string) {
    entries.clear(); errors.clear(); running = true; verbose = false; publishErrors();
    console.info(`%c><(((°>  观鱼 v${version}\n脚本已加载，详细功能日志可在「通用 → 诊断」中开启。`, 'color:#ff5d23;font-weight:bold');
  },
  setVerbose(value: boolean) {
    if (verbose === value) return;
    verbose = value;
    if (verbose) for (const entry of entries.values()) entry.results.clear();
  },
  enable(id: string, category: string, name: string, enabled = true) {
    if (!running) return;
    const previous = entries.get(id);
    if (previous?.enabled === enabled) return;
    entries.set(id, { category, name, enabled, results: new Map() });
    if (!enabled) {
      for (const [key, error] of errors) if (error.id === id) errors.delete(key);
      publishErrors();
    }
    if (verbose && (enabled || previous?.enabled)) console.info(`[观鱼][${category}][${name}] ${enabled ? '已开启' : '已关闭'}`);
  },
  report(id: string, status: Status, detail: string, stage = '适配') {
    const entry = entries.get(id);
    if (!running || !entry?.enabled) return;
    if (status === 'error') reportError(id, entry.category, entry.name, stage, detail);
    else if (status === 'applied' || status === 'ready' || status === 'idle') {
      if (errors.delete(`${id}:${stage}`)) publishErrors();
    }
    const signature = `${status}:${detail}`;
    if (entry.results.get(stage) === signature) return;
    entry.results.set(stage, signature);
    const message = `[观鱼][${entry.category}][${entry.name}][${stage}] ${labels[status]}：${detail}`;
    if (status === 'error') console.error(message);
    else if (verbose) console.info(message);
  },
  failure(scope: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    reportError(`failure.${scope}`, '运行', scope, '执行', detail);
    console.error(`[观鱼][${scope}] 执行失败：${detail}`);
  },
  subscribeErrors(listener: (value: DiagnosticError[]) => void) {
    listeners.add(listener);
    listener([...errors.values()].filter(item => !item.dismissed));
    return () => { listeners.delete(listener); };
  },
  dismissError(key: string) {
    const value = errors.get(key);
    if (value) { value.dismissed = true; publishErrors(); }
  },
  stop() { running = false; entries.clear(); errors.clear(); publishErrors(); },
};
