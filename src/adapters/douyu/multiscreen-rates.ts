import { unsafeWindow } from '$';
import type { QualityRate } from '../../features/multiscreen/quality';

interface StreamServices { encode: (...args: any[]) => void; config: any; events: any }
let runtime: any, services: StreamServices | undefined, sequence = 0;

function streamServices(): StreamServices {
  const current = (unsafeWindow as any)._room_common_;
  if (!current?.c || !current.m) throw new Error('官方清晰度服务尚未就绪');
  if (runtime === current && services) return services;
  let encode: StreamServices['encode'] | undefined, config: any, events: any;
  for (const [id, module] of Object.entries(current.c) as [string, any][]) {
    const source = current.m[id]?.toString() ?? '', value = module.exports;
    if (source.includes('encryptionOK_') && source.includes('CSQSModuleHandle') && typeof value?.default === 'function') encode = value.default;
    if (source.includes('setRid') && source.includes('setDid') && typeof value?.getRid === 'function' && typeof value?.setDid === 'function') config = value;
    if (source.includes('EventBus') && typeof value?.EventBus?.on === 'function' && typeof value.EventBus.off === 'function') events = value.EventBus;
  }
  if (!encode || !config || !events) throw new Error('官方清晰度服务尚未就绪');
  runtime = current; services = { encode, config, events }; return services;
}

export async function readMultiscreenRates(stream: any, id: number, signal: AbortSignal): Promise<QualityRate[]> {
  const { encode, config, events } = streamServices();
  const key = `guanyu-quality-${++sequence}`, event = `encryptionOK_${key}`;
  const signature = await new Promise<{ qs: string; t1: number }>((resolve, reject) => {
    const cleanup = () => { events.off(event, receive); signal.removeEventListener('abort', abort); };
    const receive = (value: { qs: string; t1: number }) => { cleanup(); resolve(value); };
    const abort = () => { cleanup(); reject(signal.reason); };
    if (signal.aborted) { reject(signal.reason); return; }
    events.on(event, receive); signal.addEventListener('abort', abort, { once: true });
    const previousId = config.getRid(), previousDid = config.getDid();
    try {
      // 独立签名事件没有播放监听；恢复 SDK 的默认上下文，不干扰正在播放的实例。
      config.setRid(id, key); config.setDid(stream.config.did, key);
      encode(undefined, 2, key);
    } catch (cause) { cleanup(); reject(cause); }
    finally { config.setRid(previousId); config.setDid(previousDid); }
  });
  if (signal.aborted) throw signal.reason;
  const body = new URLSearchParams(signature.qs);
  for (const [name, value] of Object.entries({ cdn: 'undefined', rate: 2, ver: 'streamSdk20200804b', iar: 0, ive: 0, sov: 1,
    tt: signature.t1, did: stream.config.did, from: stream.config.from, aid: stream.config.aid })) body.set(name, String(value));
  const response = await fetch(`/lapi/live/getH5Play/${id}`, { method: 'POST', body, credentials: 'include', signal });
  if (!response.ok) throw new Error(`读取清晰度失败（HTTP ${response.status}）`);
  const result = await response.json();
  if (Number(result.error) !== 0) throw new Error(result.msg || '读取清晰度失败');
  const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
  if (!Array.isArray(data?.multirates) || !data.multirates.length) throw new Error('此直播间暂未提供可选清晰度');
  return data.multirates.map((item: any) => ({ rate: Number(item.rate), name: String(item.name), diamondFan: Number(item.diamondFan) }));
}
