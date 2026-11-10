import { accountToken, assertResponse, confirmedResult, cookie, type TaskRequest } from './task-request';

export interface ClientSignStatus { signedOn: string; days: number; totalDays: number }
export interface ClientRemedyStatus {
  signedOn: string; days: number; missedDays: number; remaining: number;
  calendar: { date: string; signed: boolean }[];
}

function count(value: unknown, field: string) {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)))
    || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error(`客户端签到字段异常：${field}`);
  return Number(value);
}

function signedOn(value: unknown) {
  if (value === '' || value == null || value === '0000-00-00') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('客户端签到日期格式异常');
  return value;
}

export function createClientSignApi(http: TaskRequest, current = () => {}) {
  function request(path: string, remedy = false) {
    return http.request(`https://apiv2.douyucdn.cn/h5nc/${path}`, { method: 'POST', prepare: () => {
      current();
      const data = new URLSearchParams({ token: accountToken() });
      if (remedy) {
        const did = cookie('dy_did');
        if (!did) throw new Error('未能读取斗鱼设备标识，暂不提交补签');
        data.set('client_sys', 'android1'); data.set('did', did);
      }
      return { data: data.toString(), headers: {} };
    } });
  }
  return {
    async status(): Promise<ClientSignStatus> {
      const result = await request('sign/getSign'); assertResponse(result);
      const data = result.data;
      return { signedOn: signedOn(data?.sign_today), days: count(data?.sign_rd, 'sign_rd'), totalDays: count(data?.sign_sum, 'sign_sum') };
    },
    async remedyStatus(): Promise<ClientRemedyStatus> {
      const result = await request('Sign/getRemedySign'); assertResponse(result);
      const data = result.data;
      if (!Array.isArray(data?.sign_schedule_list)) throw new Error('客户端补签日历格式异常');
      return {
        signedOn: signedOn(data.sign_today), days: count(data.sign_running_days, 'sign_running_days'),
        missedDays: count(data.sign_omit_days, 'sign_omit_days'), remaining: count(data.sign_remedy_cnt, 'sign_remedy_cnt'),
        calendar: data.sign_schedule_list.map((item: any) => {
          if (typeof item.ds !== 'string' || !/^\d{2}\.\d{2}$/.test(item.ds) || ![0, 1].includes(Number(item.sf))) throw new Error('客户端补签日期格式异常');
          return { date: item.ds, signed: Number(item.sf) === 1 };
        }),
      };
    },
    async sign() {
      const result = await request('sign/sendSign');
      const status = confirmedResult(result);
      return { status, rewards: (result.data?.sign_pl || []).map((item: any) => `${item.name}×${item.cnt}`).join('、') as string };
    },
    async remedy() {
      const result = await request('Sign/remedySign', true); assertResponse(result);
      if (Number(result.error) !== 0) throw new Error('官方未确认客户端补签成功');
    },
  };
}
export type ClientSignApi = ReturnType<typeof createClientSignApi>;
