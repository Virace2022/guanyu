import { GM_xmlhttpRequest } from '$';

export function cookie(name: string) {
  const value = document.cookie.split('; ').find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  return decodeURIComponent(value);
}
export const accountId = () => cookie('acf_uid');
export const accountToken = () => ['acf_uid', 'acf_biz', 'acf_stk', 'acf_ct', 'acf_ltkid'].map(cookie).join('_');
export const taskGap = () => 3000 + Math.floor(Math.random() * 2001);
export const taskTimeout = (attempt = 1) => Math.min(60000, 10000 * 2 ** Math.min(3, Math.max(0, attempt - 1)));
export const taskDay = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
export const taskDelay = (attempt: number) => Math.min(300000, 30000 * 2 ** Math.min(4, Math.max(0, attempt - 1)));

export function interrupted(): Error & { interrupted: boolean } {
  return Object.assign(new Error('任务已停止，或登录账号已变化'), { interrupted: true });
}
export function responseError(result: any, fallback = '接口未说明原因') {
  const message = String(result.message || result.msg || fallback).trim().slice(0, 160);
  const codes = ['error', 'status_code'].filter(key => result[key] != null).map(key => `${key}=${String(result[key]).slice(0, 24)}`);
  return `${message}${codes.length ? `（${codes.join('，')}）` : ''}`;
}
export function assertResponse(result: any) {
  if ((result.error != null && Number(result.error) !== 0) || (result.status_code != null && Number(result.status_code) !== 200)) {
    throw new Error(responseError(result));
  }
}
export function confirmedResult(result: any): 'signed' | 'already' {
  const message = String(result.message || result.msg || '').trim();
  if (/^(?:(?:您|你)(?:今天|今日)?|(?:今天|今日)(?:您|你)?)?(?:已|已经)(?:成功)?签(?:到(?:过)?|过到?)(?:了)?(?:$|[！!。，,；;.])/.test(message)
    || /^请勿重复签到[！!。.]?$/.test(message)) return 'already';
  assertResponse(result);
  if (result.error != null && Number(result.error) === 0 || result.status_code != null && Number(result.status_code) === 200) return 'signed';
  throw new Error(responseError(result, '接口未确认操作成功'));
}

interface RequestOptions {
  method?: string; data?: string; headers?: Record<string, string>; attempt?: number;
  groupId?: string; mobile?: boolean; yuba?: boolean; text?: boolean;
}

export function createTaskRequest(storage: Storage = localStorage) {
  const abort = new AbortController();
  function check(uid: string) { if (abort.signal.aborted || accountId() !== uid) throw interrupted(); }
  function wait(ms: number) {
    return new Promise<void>((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(interrupted()); };
      const timer = setTimeout(() => { abort.signal.removeEventListener('abort', stop); resolve(); }, ms);
      abort.signal.addEventListener('abort', stop, { once: true });
      if (abort.signal.aborted) stop();
    });
  }
  async function request(path: string, options: RequestOptions = {}): Promise<any> {
    const uid = accountId();
    check(uid);
    if (!uid) throw new Error('请先登录斗鱼');
    if (!navigator.locks) throw new Error('自动签到需要 HTTPS 和支持 Web Locks 的新版浏览器');
    return navigator.locks.request(`guanyu:task-requests:${uid}`, { signal: abort.signal }, async () => {
      const key = `guanyu:task-gap:v1:${uid}`, timeout = taskTimeout(options.attempt);
      check(uid);
      const due = Number(storage.getItem(key)) || 0;
      if (due > Date.now()) await wait(due - Date.now());
      check(uid);
      // 所有签到共享账号间隔；页面在请求中关闭，接手页也须等待原超时边界。
      storage.setItem(key, String(Date.now() + timeout + taskGap()));
      try {
        return await new Promise((resolve, reject) => {
          let handle: ReturnType<typeof GM_xmlhttpRequest> | undefined, settled = false;
          const finish = (error?: Error, result?: unknown) => {
            if (settled) return;
            settled = true; clearTimeout(timer); abort.signal.removeEventListener('abort', stop);
            if (error) reject(error); else resolve(result);
          };
          const stop = () => { finish(interrupted()); handle?.abort(); };
          const timer = setTimeout(() => { finish(new Error(`请求超过 ${timeout / 1000} 秒未响应`)); handle?.abort(); }, timeout);
          abort.signal.addEventListener('abort', stop, { once: true });
          const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', ...options.headers };
          if (options.mobile) { headers.client = 'android'; headers.token = accountToken(); }
          else if (options.yuba || path.includes('yuba.douyu.com') || path.startsWith('/wbapi') || path.startsWith('/ybapi')) {
            headers['dy-client'] = 'pc'; headers['dy-token'] = accountToken();
          }
          if (options.groupId) headers.Referer = `https://yuba.douyu.com/group/${options.groupId}`;
          const url = path.startsWith('https://') ? path : `${options.yuba || path.startsWith('/wbapi') || path.startsWith('/ybapi') ? 'https://yuba.douyu.com' : 'https://www.douyu.com'}${path}`;
          try {
            handle = GM_xmlhttpRequest({ method: options.method || 'GET', url, headers, data: options.data,
              timeout, responseType: options.text ? 'text' : 'json',
              onload(response) {
                try {
                  check(uid);
                  let result = options.text ? response.responseText : response.response;
                  if (!options.text && (!result || typeof result !== 'object')) result = JSON.parse(response.responseText);
                  if (response.status < 200 || response.status >= 300) throw new Error(`接口 HTTP ${response.status}${!options.text && result ? `：${responseError(result)}` : ''}`);
                  if (!options.text && (!result || typeof result !== 'object' || Array.isArray(result))) throw new Error('接口没有返回有效 JSON');
                  finish(undefined, result);
                } catch (error) { finish(error as Error); }
              },
              onerror: () => finish(new Error('网络请求失败')),
              ontimeout: () => finish(new Error(`请求超过 ${timeout / 1000} 秒未响应`)),
              onabort: () => finish(interrupted()),
            });
          } catch (error) { finish(error as Error); }
        });
      } finally {
        if (!abort.signal.aborted && accountId() === uid) storage.setItem(key, String(Date.now() + taskGap()));
      }
    });
  }
  return { request, dispose: () => abort.abort() };
}
export type TaskRequest = ReturnType<typeof createTaskRequest>;
