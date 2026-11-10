import { GM_xmlhttpRequest } from '$';
import { hex_md5 } from '../../../core/md5';
import { getCookieValue, getDouyuRealLiveAuth } from './auth';
import { diagnostics } from '../../../core/diagnostics';
export class TeamLiveStreamSource {
    constructor(monitor) {
        this.monitor = monitor;
        this.encryption = null;
        this.encryptionTime = 0;
    }

    async get(tile, token) {
        if (this.monitor.focus.original(tile) || this.monitor.page.owner.layout.previewSource === "lowest") {
            try { this.monitor.flv = await this.monitor.loadFlv(); } catch (cause) { diagnostics.report('team.preview', 'error', `flv.js 加载失败：${cause.message}，继续尝试原生预览`, '播放器依赖'); this.monitor.flv = null; }
        }
        if (this.monitor.focus.original(tile)) {
            try {
                if (!this.monitor.flv?.isSupported()) throw new Error("浏览器不支持原声预览");
                const encryption = await this.key(tile, token);
                const data = await this.live(tile, token, encryption, 0);
                if (!this.monitor.valid(tile, token)) throw new Error("预览已取消");
                return { kind: "flv", mode: "original", hasAudio: true, url: this.url(data) };
            } catch (error) {
                if (!this.monitor.valid(tile, token)) throw error;
                diagnostics.report('team.preview', 'error', `原声取流失败：${error.message}，继续尝试备用来源`, `房间 ${tile.id} 取流`);
                tile.originalFailed = true;
            }
        }
        if (this.monitor.page.owner.layout.previewSource === "lowest" && tile.lowestSupported !== false && this.monitor.flv?.isSupported()) {
            try {
                const source = await this.lowest(tile, token);
                if (!this.monitor.valid(tile, token)) throw new Error("预览已取消");
                tile.lowestSupported = !!source;
                if (source) return source;
            } catch (error) {
                if (!this.monitor.valid(tile, token)) throw error;
                diagnostics.report('team.preview', 'error', `低画质取流失败：${error.message}，继续尝试原生预览`, `房间 ${tile.id} 取流`);
                tile.lowestSupported = false;
            }
        }
        return this.preview(tile, token);
    }

    request(tile, token, options) {
        if (!this.monitor.valid(tile, token)) return Promise.reject(new Error("预览已取消"));
        return new Promise((resolve, reject) => {
            const finish = (callback, value) => {
                if (tile.token === token) tile.request = null;
                callback(value);
            };
            tile.request = GM_xmlhttpRequest({
                ...options, responseType: "json", timeout: 12000,
                onload: response => {
                    try { finish(resolve, typeof response.response === "string" ? JSON.parse(response.response) : response.response); }
                    catch (error) { finish(reject, error); }
                },
                onerror: () => finish(reject, new Error("预览请求失败")),
                ontimeout: () => finish(reject, new Error("预览请求超时")),
                onabort: () => finish(reject, new Error("预览已取消"))
            });
        });
    }

    data(result) {
        if (Number(result?.error) === 104) throw new Error("未开播");
        if (Number(result?.error) !== 0) throw new Error(`预览接口未确认成功（error=${result?.error ?? '缺失'}）`);
        const data = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
        if (!data || typeof data !== "object") throw new Error("预览暂不可用");
        return data;
    }

    url(data) {
        if (!data?.rtmp_url || !data.rtmp_live) throw new Error("预览地址不可用");
        const url = new URL(`${data.rtmp_url}/${data.rtmp_live}`);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("预览地址不可用");
        return url.href;
    }

    did() { return getCookieValue("dy_did") || "10000000000000000000000000001501"; }

    async preview(tile, token) {
        const id = tile.id, time = String(Date.now());
        const result = await this.request(tile, token, {
            method: "POST",
            url: `https://playweb.douyucdn.cn/lapi/live/hlsH5Preview/${id}?${time}${Math.floor(Math.random() * 100000)}`,
            headers: { rid: id, time, auth: hex_md5(id + time), "Content-Type": "application/x-www-form-urlencoded" },
            data: new URLSearchParams({ rid: id, did: this.did() }).toString()
        });
        return { kind: "hls", url: this.url(this.data(result)) };
    }

    async key(tile, token) {
        if (this.encryption && Date.now() - this.encryptionTime < 20000) return this.encryption;
        const result = await this.request(tile, token, { method: "GET", url: `https://www.douyu.com/wgapi/livenc/liveweb/websec/getEncryption?did=${encodeURIComponent(this.did())}` });
        const data = this.data(result);
        this.encryption = data; this.encryptionTime = Date.now();
        return data;
    }

    async live(tile, token, encryption, rate) {
        const did = this.did(), ts = Math.round(Date.now() / 1000);
        const auth = getDouyuRealLiveAuth(tile.id, did, ts, encryption.key, encryption.rand_str, encryption.enc_time, encryption.is_special);
        const result = await this.request(tile, token, {
            method: "POST", url: `https://www.douyu.com/lapi/live/getH5PlayV1/${tile.id}`,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: new URLSearchParams({ enc_data: encryption.enc_data, tt: String(ts), did, auth, cdn: "", rate: String(rate), hevc: "0", fa: "0", ive: "0" }).toString()
        });
        return this.data(result);
    }

    async lowest(tile, token) {
        const encryption = await this.key(tile, token);
        let data = await this.live(tile, token, encryption, 1);
        const rates = Array.isArray(data.multirates) ? data.multirates : [];
        const original = rates.find(rate => Number(rate.rate) === 0);
        const lowest = rates.filter(rate => Number(rate.rate) > 0 && Number(rate.bit) > 0).sort((a, b) => Number(a.bit) - Number(b.bit))[0];
        // rate=1 可能被服务端回落到原画，只在确有较低档位且实际返回该档时使用。
        if (!lowest || (Number(original?.bit) > 0 && Number(lowest.bit) >= Number(original.bit))) return null;
        if (Number(data.rate) !== Number(lowest.rate)) data = await this.live(tile, token, encryption, Number(lowest.rate));
        if (Number(data.rate) !== Number(lowest.rate)) return null;
        return { kind: "flv", url: this.url(data) };
    }
}
