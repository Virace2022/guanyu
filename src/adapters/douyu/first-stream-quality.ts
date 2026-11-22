import { readSettings } from '../../config/settings';

interface FirstStreamPage extends Window {
  preloadStreamUrlPromise?: Promise<StartupStream>;
  webpackChunk_N_E?: unknown[];
  $ROOM?: { room_id?: number | string };
}

interface StreamRate {
  rate: number;
  diamondFan?: number;
}

interface StartupStream {
  room_id: number;
  rate: number;
  multirates?: StreamRate[];
  rtmp_url?: string;
  rtmp_live?: string;
  is_mixed?: boolean;
  rtc_stream_url?: string;
  p2p?: number;
  h265_p2p?: number;
}

interface StreamResult { error: number; data?: StartupStream }

interface StartupService {
  baseParams?: { rid: number | string };
  firstLoadStream: unknown;
  getH5Play(options: { rate: number }): Promise<StartupStream>;
}

interface NextRuntime {
  (id: string): { [key: string]: StartupService };
  m: Record<string, unknown>;
}

const originalRate = 0;
const startupSelectionTimeout = 3000;
const restoreRateKey = 'realRateModel2_h5p_room';
const firstStreamPath = /^\/(?:lapi\/live\/getH5PlayV1|gapi\/live\/web\/super\/stream\/v1)\/([1-9]\d*)$/;
const preloadKey = 'preloadStreamUrlPromise';

function keepStartupCdn(data: StartupStream) {
  if (data.is_mixed || data.rtc_stream_url || !data.rtmp_url || !data.rtmp_live || !data.p2p) return data;
  // 原生先用预载 CDN，并在 P2P 标记非零时安排第二次换流。直接使用同一 CDN 连续流可省掉这次交接。
  return { ...data, p2p: 0, h265_p2p: 0 };
}

function rememberStartupRate(page: Window, selected: number) {
  try {
    const storage = page.localStorage;
    const raw = storage.getItem(restoreRateKey);
    if (raw === null) return true;
    const saved = JSON.parse(raw);
    if (saved?.r !== 1 || !saved.c || !(saved.e > Date.now())) return true;
    const rate = JSON.parse(saved.v);
    if (rate === -1 || rate === selected) return true;
    if (!Number.isInteger(rate)) return false;
    // 只更新官方启动定时器会恢复的旧档位，保留预载替换和原有有效期。
    storage.setItem(restoreRateKey, JSON.stringify({ ...saved, v: JSON.stringify(selected) }));
    return true;
  } catch { return false; }
}

function startupService(page: FirstStreamPage, roomId: string) {
  const chunks = page.webpackChunk_N_E;
  if (!Array.isArray(chunks) || chunks.push === Array.prototype.push) return;
  let runtime: NextRuntime | undefined;
  chunks.push([['guanyu-first-stream'], {}, (require: NextRuntime) => { runtime = require; }]);
  const modules = runtime?.m;
  if (!runtime || !modules) return;
  const id = Object.keys(modules).find(key => {
    const source = String(modules[key]);
    return source.includes('firstLoadStream=function') && source.includes(preloadKey) && source.includes('getH5Play=function');
  });
  if (!id) return;
  return Object.values(runtime(id)).find(service => String(service?.baseParams?.rid) === roomId
    && typeof service.firstLoadStream === 'function' && typeof service.getH5Play === 'function');
}

function highestOrdinaryRate(data: StartupStream) {
  return Array.isArray(data.multirates) ? data.multirates.find(rate => Number(rate.diamondFan) !== 1) : undefined;
}

export function preferFirstStreamQuality(page: FirstStreamPage) {
  function enabled() {
    try { return readSettings(page.localStorage).playback.highestQuality; }
    catch { return false; }
  }
  if (!/^\/(?:\d|beta\/|topic\/)/.test(page.location.pathname) || !enabled()) return;

  const nativeFetch = page.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(page, preloadKey);
  let preload = page.preloadStreamUrlPromise;
  let selectedPreload: Promise<StartupStream> | undefined;
  let confirmed: { roomId: string; rate: number } | undefined;
  let disposed = false;
  function restoreFetch() {
    if (page.fetch === intercept) page.fetch = nativeFetch;
    page.removeEventListener('load', restoreFetch);
  }
  function restorePreload(value = preload) {
    if (Object.getOwnPropertyDescriptor(page, preloadKey)?.get !== getPreload) return;
    if (!value && !descriptor) Reflect.deleteProperty(page, preloadKey);
    else Object.defineProperty(page, preloadKey, { configurable: true, enumerable: descriptor?.enumerable ?? true, writable: true, value });
  }
  function dispose() {
    disposed = true;
    restoreFetch();
    restorePreload();
    page.removeEventListener('pagehide', dispose);
  }

  function confirm(roomId: string, rate: number) {
    if (!disposed && enabled() && rememberStartupRate(page, rate)) confirmed = { roomId, rate };
  }

  async function selectPreload(data: StartupStream) {
    if (!data || disposed || !enabled()) return data;
    const roomId = String(data.room_id);
    const rate = Number(highestOrdinaryRate(data)?.rate);
    if (!/^[1-9]\d*$/.test(roomId) || !Number.isInteger(rate) || rate < 0) return data;
    const currentRate = Number(data.rate);
    if (currentRate === rate) {
      confirm(roomId, rate);
      return keepStartupCdn(data);
    }
    let timer: number | undefined;
    try {
      const service = startupService(page, roomId);
      if (service) {
        const target = await Promise.race([
          service.getH5Play({ rate }),
          new Promise<undefined>(resolve => { timer = page.setTimeout(resolve, startupSelectionTimeout); }),
        ]);
        if (!disposed && enabled() && target && String(target.room_id) === roomId
          && Number(target.rate) === rate && Number(highestOrdinaryRate(target)?.rate) === rate) {
          confirm(roomId, rate);
          return target;
        }
      }
    } catch { /* 官方目标档位不可用时沿用原预载结果。 */ }
    finally { page.clearTimeout(timer); }
    if (disposed || !enabled()) return data;
    if (data.multirates?.some(value => Number(value.rate) === currentRate && Number(value.diamondFan) !== 1)) {
      rememberStartupRate(page, currentRate);
    }
    return keepStartupCdn(data);
  }

  function getPreload() {
    // 官方主屏在初始化取流服务后才读取此 Promise；缓存命中或脚本迟到时，仍能在提交流地址前补选画质。
    if (preload) selectedPreload ??= preload.then(selectPreload).finally(() => { restoreFetch(); restorePreload(selectedPreload); });
    return selectedPreload;
  }
  function setPreload(value: Promise<StartupStream> | undefined) {
    preload = value;
    selectedPreload = undefined;
  }

  async function requestQuality(roomId: string, input: string, init: RequestInit, body: string, fromPreload: boolean) {
    try {
      const response = await nativeFetch.call(page, input, { ...init, body });
      if (response.ok) {
        const result: StreamResult = await response.clone().json();
        const data = result?.data;
        if (Number(result?.error) === 0 && data && String(data.room_id) === roomId) {
          const actual = Number(data.rate);
          const selected = Array.isArray(data.multirates) && data.multirates.find(rate => Number(rate.rate) === actual);
          if (!selected || Number(selected.diamondFan) !== 1) {
            if (!disposed && enabled() && actual === Number(highestOrdinaryRate(data)?.rate)) {
              confirm(roomId, actual);
              const prepared = fromPreload ? keepStartupCdn(data) : data;
              if (prepared !== data) {
                const headers = new Headers(response.headers);
                headers.delete('content-length');
                headers.delete('content-encoding');
                return new Response(JSON.stringify({ ...result, data: prepared }), {
                  status: response.status, statusText: response.statusText, headers,
                });
              }
            }
            return response;
          }
        }
      }
    } catch (error) {
      if (disposed || init.signal?.aborted) throw error;
    }
    return nativeFetch.call(page, input, init);
  }

  const intercept: typeof fetch = function(this: Window, input, init) {
    if (typeof input === 'string' && init?.method === 'POST' && typeof init.body === 'string'
      && /(?:^|&)ver=Douyu_new(?:&|$)/.test(init.body) && /(?:^|&)fa=0(?:&|$)/.test(init.body)) {
      const roomId = firstStreamPath.exec(input)?.[1];
      const body = init.body.replace(/(^|&)rate=-?\d+(?=&|$)/, `$1rate=${originalRate}`);
      const fromPlayer = /(?:^|&)sov=0(?:&|$)/.test(init.body);
      const fromPreload = !!preload && !fromPlayer;
      const video = fromPlayer && page.document.querySelector<HTMLVideoElement>('#js-player-video-first video');
      const directStartup = !preload && fromPlayer && String(page.$ROOM?.room_id ?? page.location.pathname.slice(1)) === roomId
        && (!video || (!video.currentSrc && !video.srcObject && video.readyState === 0));
      if (roomId && body !== init.body && (fromPreload || directStartup)) {
        restoreFetch();
        if (enabled()) return requestQuality(roomId, input, init, body, fromPreload);
      }
    }
    return nativeFetch.call(this, input, init);
  };

  if (descriptor && (!descriptor.configurable || !descriptor.writable)) return;
  try {
    Object.defineProperty(page, preloadKey, { configurable: true, enumerable: descriptor?.enumerable ?? true, get: getPreload, set: setPreload });
    if (page.document.readyState !== 'complete') {
      page.fetch = intercept;
      page.addEventListener('load', restoreFetch, { once: true });
    }
  } catch { dispose(); return; }
  page.addEventListener('pagehide', dispose, { once: true });
  return { usedRate: (roomId: string, rate: number) => roomId === confirmed?.roomId && rate === confirmed.rate, dispose };
}

export type FirstStreamQuality = ReturnType<typeof preferFirstStreamQuality>;
