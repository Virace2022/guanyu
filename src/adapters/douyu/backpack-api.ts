import { assertResponse, accountId, taskDay } from './task-request';

export interface BagGift { id: number; name: string; count: number; expiry: number; met: number; price: number; intimate: number; isValuable: number; picUrlPrefix: string; propPic?: { src: string }[] }
export interface FanBadge { id: string; name: string; since: number; days: number }
export interface PocketItem { name: string; intro: string; webIcon: string; expireTime: number }
export interface MonthCost { date: string; uid: string; total: number; details: { name: string; amount: number }[] }

export class BackpackApi {
  private requests = new Set<AbortController>();
  async request(path: string, body?: URLSearchParams, text = false): Promise<any> {
    const abort = new AbortController(); this.requests.add(abort);
    const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(path, { credentials: 'include', signal: abort.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body } : {}) });
      if (!response.ok) throw new Error(`背包资料请求失败（HTTP ${response.status}）`);
      if (text) return await response.text();
      const result = await response.json();
      if (!result || !('error' in result || 'status_code' in result)) throw new Error('接口未确认请求结果');
      assertResponse(result); return result.data;
    } finally { clearTimeout(timer); this.requests.delete(abort); }
  }
  async bag(room: string): Promise<BagGift[]> {
    const data = await this.request(`/japi/prop/backpack/web/v5?rid=${room}`);
    if (!Array.isArray(data?.list)) throw new Error('背包礼物列表格式异常');
    return data.list;
  }
  async badges(): Promise<FanBadge[]> {
    const doc = new DOMParser().parseFromString(await this.request('/member/cp/getFansBadgeList', undefined, true), 'text/html');
    if (!doc.querySelector('.fans-badge-list')) throw new Error('未能读取粉丝牌，请检查登录状态');
    return [...doc.querySelectorAll<HTMLElement>('[data-fans-room]')].map(node => {
      const since = Number(node.dataset.fansGbdgts) * 1000;
      return { id: node.dataset.fansRoom || '', name: node.querySelector('td:nth-child(2) a')?.textContent?.trim() || node.dataset.fansRoom || '', since,
        days: since > 0 ? Math.max(0, Math.floor((Date.now() - since) / 86400000)) : 0 };
    }).filter(item => /^\d+$/.test(item.id));
  }
  async vip(room: string): Promise<number | null> {
    const doc = new DOMParser().parseFromString(await this.request('/member/platform_task/effect_list', undefined, true), 'text/html');
    if (!doc.querySelector('.enter-wraper')) throw new Error('未能读取头衔资料，请检查登录状态');
    for (const node of doc.querySelectorAll('.show-effect-more[data-detail]')) {
      const detail = JSON.parse(node.getAttribute('data-detail') || '{}');
      if (String(detail.property_id) === '1646' && String(detail.show_id_list).split(',').includes(room)) return Math.max(0, Math.floor((Number(detail.expire_time) * 1000 - Date.now()) / 86400000));
    }
    return null;
  }
  async pocket(room: string): Promise<PocketItem[]> {
    const data = await this.request(`/japi/interact/cdn/pocket/effective?rid=${room}`);
    if (!Array.isArray(data?.list)) throw new Error('主播口袋资料格式异常');
    return data.list;
  }
  async month(): Promise<MonthCost> {
    const uid = accountId();
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1);
    const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const details = new Map<string, number>();
    const add = (name: string, amount: number) => { if (!Number.isFinite(amount)) throw new Error('消费金额格式异常'); details.set(name, (details.get(name) || 0) + Math.abs(amount)); };
    let cursor = '';
    while (true) {
      const query = new URLSearchParams({ queryType: '0', consumeType: '0', startDate: String(Math.round(+start / 1000)), endDate: String(Math.round(+now / 1000)),
        tradeStartDate: format(start), tradeEndDate: format(now), direction: '1', ...(cursor ? { id: cursor } : {}) });
      const list = await this.request(`/wjapi/nc/exchange/consume/giftList?${query}`);
      if (!Array.isArray(list)) throw new Error('消费明细格式异常');
      for (const item of list) add(item.consumeTypeDesc || '其他', Number(item.amount));
      if (list.length < 20) break;
      const next = String(list[list.length - 1].id);
      if (next === cursor) throw new Error('消费明细分页未前进');
      cursor = next;
    }
    for (let page = 1; ; page++) {
      const data = await this.request(`/japi/interactnc/web/dFansbadge/myLogs?type=0&page=${page}`);
      if (!Array.isArray(data?.list)) throw new Error('钻粉消费明细格式异常');
      for (const item of data.list) {
        const time = Number(item.consumeTime) * 1000;
        if (time >= +start && time <= +now) add('钻粉充值/续费', Number(item.consumeMoney));
      }
      if (data.list.length < 20 || Number(data.list[data.list.length - 1].consumeTime) * 1000 < +start) break;
    }
    if (uid !== accountId()) throw new Error('账号已变化，请重新读取消费数据');
    return { uid, date: taskDay(), total: [...details.values()].reduce((sum, amount) => sum + amount, 0), details: [...details].map(([name, amount]) => ({ name, amount })) };
  }
  async donate(gift: number, count: number, room: string) {
    await this.request('/japi/prop/donate/mainsite/v1', new URLSearchParams({ propId: String(gift), propCount: String(count), roomId: room, bizExt: '{"yzxq":{}}' }));
  }
  close() { for (const abort of this.requests) abort.abort(); this.requests.clear(); }
}
