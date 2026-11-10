import { assertResponse, cookie, responseError } from './task-request';

export interface StarPacket { id: string; code: string; status: number; readyAt: number }
export interface PacketClaim { status: 'received' | 'exhausted' | 'retry' | 'failed'; detail: string }
const base = '/japi/livebiznc/web/anchorstardiscover/redbag';

function data(value: unknown): any {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('星推荐红包数据格式异常');
  return parsed;
}

function number(value: unknown, field: string) {
  if (!['number', 'string'].includes(typeof value) || !/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error(`星推荐红包字段异常：${field}`);
  return Number(value);
}

export function createStarPacketApi(signal: AbortSignal, current = () => {}) {
  async function request(path: string, options: RequestInit = {}, timeout = 10000): Promise<any> {
    current();
    const abort = new AbortController();
    const cancel = () => abort.abort();
    const stop = options.signal;
    signal.addEventListener('abort', cancel, { once: true });
    stop?.addEventListener('abort', cancel, { once: true });
    if (signal.aborted || stop?.aborted) cancel();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; cancel(); }, timeout);
    try {
      // 抢领独立于签到请求队列，避免开抢时仍在等待账号请求间隔。
      const response = await fetch(`https://www.douyu.com${path}`, { ...options, credentials: 'include', signal: abort.signal });
      const result = await response.json().catch(() => {
        if (response.ok) throw new Error('红包接口没有返回有效 JSON');
      }); current();
      if (!response.ok) throw Object.assign(new Error(`红包接口 HTTP ${response.status}${result && typeof result === 'object' ? `：${responseError(result)}` : ''}`), { terminal: true });
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('红包接口没有返回有效 JSON');
      return result;
    } catch (cause) {
      if (timedOut) throw new Error(`红包请求超过 ${timeout / 1000} 秒未响应`);
      throw cause;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', cancel); stop?.removeEventListener('abort', cancel);
    }
  }
  return {
    async prepare() {
      if (!cookie('acf_ccn') && !cookie('ccn')) assertResponse(await request('/wgapi/livenc/liveweb/csrfApi/getCsrfCookie'));
      current();
      if (!cookie('acf_ccn') && !cookie('ccn')) throw new Error('未能读取红包领取所需的防伪参数');
    },
    async list(room: string): Promise<StarPacket[]> {
      const result = await request(`${base}/room/list?rid=${room}`); assertResponse(result);
      const value = data(result.data);
      if (String(value.rid) !== room || !Array.isArray(value.redBagList)) throw new Error('星推荐红包房间或列表格式异常');
      return value.redBagList.filter((item: any) => [7, 8].includes(Number(item.rbType))).map((item: any) => {
        const id = String(item.id), status = number(item.status, 'status');
        if (!/^[1-9]\d*$/.test(id) || typeof item.id === 'number' && !Number.isSafeInteger(item.id)) throw new Error('星推荐红包编号格式异常');
        const wait = Math.max(0, number(item.waitSec ?? 0, 'waitSec'));
        if (status === 0 && (typeof item.code !== 'string' || !item.code)) throw new Error('星推荐红包缺少领取凭据');
        return { id, status, code: status === 0 ? item.code : '', readyAt: Date.now() + wait * 1000 };
      });
    },
    async claim(room: string, packet: StarPacket, stop: AbortSignal): Promise<PacketClaim> {
      current();
      const ctn = cookie('acf_ccn') || cookie('ccn');
      if (!ctn) throw new Error('未能读取红包领取所需的防伪参数');
      const result = await request(`${base}/snatch`, { method: 'POST', signal: stop,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: packet.code, id: packet.id, rid: room, ctn }).toString(),
      }, 1500);
      if (result.error === 0 || result.error === '0') return { status: 'received', detail: '星推荐红包领取成功' };
      if (Number(result.error) === 12001) return { status: 'exhausted', detail: '星推荐红包已被抢完' };
      return { status: Number(result.error) === 12006 ? 'retry' : 'failed', detail: responseError(result, '星推荐红包领取失败') };
    },
  };
}
