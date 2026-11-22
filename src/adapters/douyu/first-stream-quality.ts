import { readSettings } from '../../config/settings';

interface FirstStreamPage extends Window {
  preloadStreamUrlPromise?: Promise<unknown>;
}

interface StreamRate {
  rate: number;
  diamondFan?: number;
}

interface StreamResult {
  error: number;
  data?: { room_id: number; rate: number; multirates?: StreamRate[] };
}

const originalRate = 0;
const restoreRateKey = 'realRateModel2_h5p_room';
const firstStreamPath = /^\/(?:lapi\/live\/getH5PlayV1|gapi\/live\/web\/super\/stream\/v1)\/([1-9]\d*)$/;

function rememberStartupRate(page: Window) {
  try {
    const storage = page.localStorage;
    const raw = storage.getItem(restoreRateKey);
    if (raw === null) return true;
    const saved = JSON.parse(raw);
    if (saved?.r !== 1 || !saved.c || !(saved.e > Date.now())) return true;
    const rate = JSON.parse(saved.v);
    if (rate === -1 || rate === originalRate) return true;
    if (!Number.isInteger(rate) || !readSettings(storage).playback.highestQuality) return false;
    // 只更新官方启动定时器会恢复的旧档位，保留预载替换和原有有效期。
    storage.setItem(restoreRateKey, JSON.stringify({ ...saved, v: JSON.stringify(originalRate) }));
    return true;
  } catch { return false; }
}

export function preferFirstStreamQuality(page: FirstStreamPage) {
  if (!/^\/(?:\d|beta\/|topic\/)/.test(page.location.pathname) || page.document.readyState === 'complete') return;
  try { if (!readSettings(page.localStorage).playback.highestQuality) return; }
  catch { return; }

  const nativeFetch = page.fetch;
  let confirmedRoom: string | undefined;
  let disposed = false;
  function restore() {
    if (page.fetch === intercept) page.fetch = nativeFetch;
    page.removeEventListener('load', restore);
    page.removeEventListener('pagehide', onPageHide);
  }
  function dispose() { disposed = true; restore(); }
  function onPageHide(event: PageTransitionEvent) {
    if (event.persisted) restore();
    else dispose();
  }

  async function requestQuality(roomId: string, input: string, init: RequestInit, body: string) {
    try {
      const response = await nativeFetch.call(page, input, { ...init, body });
      if (response.ok) {
        const result: StreamResult = await response.clone().json();
        const data = result?.data;
        if (Number(result?.error) === 0 && data) {
          const rates = Array.isArray(data.multirates) ? data.multirates : [];
          const selected = rates.find(rate => Number(rate.rate) === Number(data.rate));
          if (Number(data.rate) !== originalRate || Number(selected?.diamondFan) !== 1) {
            if (!disposed && String(data.room_id) === roomId && selected && selected === rates[0]
              && Number(selected.rate) === originalRate && rememberStartupRate(page)) confirmedRoom = roomId;
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
    if (typeof input === 'string' && page.preloadStreamUrlPromise && init?.method === 'POST' && typeof init.body === 'string'
      && /(?:^|&)ver=Douyu_new(?:&|$)/.test(init.body) && /(?:^|&)fa=0(?:&|$)/.test(init.body)) {
      const roomId = firstStreamPath.exec(input)?.[1];
      const body = init.body.replace(/(^|&)rate=-1(?=&|$)/, `$1rate=${originalRate}`);
      if (roomId && body !== init.body) {
        // 首路沿用官方签名和参数，仅替换画质。后续房间与手动切换继续使用原生 fetch。
        restore();
        return requestQuality(roomId, input, init, body);
      }
    }
    return nativeFetch.call(this, input, init);
  };

  try { page.fetch = intercept; }
  catch { return; }
  page.addEventListener('load', restore, { once: true });
  page.addEventListener('pagehide', onPageHide, { once: true });
  return { usedRate: (roomId: string, rate: number) => roomId === confirmedRoom && rate === originalRate, dispose };
}

export type FirstStreamQuality = ReturnType<typeof preferFirstStreamQuality>;
