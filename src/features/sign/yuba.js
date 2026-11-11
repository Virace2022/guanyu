import { accountId, accountReady } from '../../adapters/douyu/task-request';
import { SignYuba_timeout, SignYuba_assertResponse, SignYuba_signResult, SignYuba_supplementComplete } from './yuba-response';

function SignYuba_day(now = Date.now()) {
    return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}

function SignYuba_delay(attempts) {
    return Math.min(300000, 30000 * 2 ** Math.min(4, Math.max(0, attempts - 1)));
}

function SignYuba_gap() {
    return 3000 + Math.floor(Math.random() * 2001);
}

function SignYuba_newState(day) {
    return {
        day, list: { page: 1, pages: 1, done: false, attempts: 0, nextAt: 0, error: "", ids: [] },
        groups: {}, notified: false, requestAt: 0
    };
}

function SignYuba_complete(state) {
    return state.list.done && Object.values(state.groups).every(group => group.status !== "pending");
}

export class SignYubaController {
    constructor(settings, api, report, notify, reminder, runner) {
        this.settings = settings; this.api = api; this.report = report; this.notify = notify; this.reminder = reminder;
        this.runner = runner;
        this.listeners = [];
        this.running = false;
        this.timer = null;
        this.uid = null;
        this.state = null;
        this.storageError = false;
        this.pageId = Math.random().toString(36).slice(2, 8);
    }

    start() {
        this.log("启动自动签到");
        const listen = (target, type, run) => {
            target.addEventListener(type, run);
            this.listeners.push(() => target.removeEventListener(type, run));
        };
        listen(window, "storage", event => {
            if (!event.key || event.key === "guanyu:settings:v1" || event.key === this.key || this.runner.matches(event.key)) void this.wake();
        });
        listen(document, "visibilitychange", () => { if (!document.hidden) void this.wake(); });
        listen(document, "fullscreenchange", () => { if (!document.fullscreenElement) void this.wake(); });
        listen(window, "online", () => void this.wake());
        this.watchReminders();
        void this.wake();
    }

    dispose() {
        this.stopped = true;
        clearTimeout(this.timer); clearInterval(this.reminderTimer);
        for (const remove of this.listeners) remove();
        this.listeners = [];
        this.api.dispose();
    }

    watchReminders() {
        if (!this.reminderTimer) this.reminderTimer = setInterval(() => void this.remind(), 15000);
    }

    async wake(manual = false) {
        if (this.stopped) return;
        if (this.running) {
            if (manual) this.notify("【鱼吧】正在签到，失败项会继续重试", "info");
            return;
        }
        clearTimeout(this.timer);
        this.running = true;
        this.waiting = false;
        const previousError = this.storageError;
        try {
            const uid = accountId();
            if (!uid) {
                this.uid = null; this.state = null;
                this.status("登录后自动签到鱼吧。");
                if (manual) this.notify("【鱼吧】请先登录斗鱼", "error");
                return;
            }
            this.uid = String(uid);
            this.key = `guanyu:yuba:v1:${this.uid}`;
            if (!accountReady()) {
                this.waiting = true;
                this.status("等待斗鱼登录就绪，暂不请求鱼吧。");
                return;
            }
            if (!navigator.locks) throw new Error("鱼吧签到需要 HTTPS 页面和支持 Web Locks 的新版浏览器");
            await this.remind();
            if (!await this.runner.claim(this.uid)) { this.waitForOtherPage(manual); return; }
            const run = async () => {
                this.load();
                if (this.runner.take('yuba')) manual = true;
                if (manual) {
                    this.retryNow();
                    this.notify(SignYuba_complete(this.state) ? "【鱼吧】今日已签到" : "【鱼吧】已检查今日进度，未完成项会按间隔处理", "info");
                }
                await this.run();
            };
            await navigator.locks.request(`guanyu:yuba:${this.uid}`, { ifAvailable: true }, async lock => {
                if (lock) {
                    if (this.lockWaitLogged) this.log("已接手共享签到进度");
                    this.lockWaitLogged = false;
                    await run();
                } else this.waitForOtherPage(manual);
            });
        } catch (error) {
            if (!error.interrupted) {
                this.status(error.message);
                if (!previousError) {
                    this.log("调度无法继续", { reason: error.message }, "error");
                    this.notify(`【鱼吧】${error.message}`, "error");
                }
                this.storageError = true;
            }
        } finally {
            this.running = false;
            this.schedule();
        }
    }

    waitForOtherPage(manual) {
        this.waiting = true;
        if (!this.lockWaitLogged) this.log("其他页面正在处理，等待共享结果");
        this.lockWaitLogged = true;
        this.load(false);
        this.updateStatus();
        if (manual) this.notify("【鱼吧】其他直播页正在签到，稍后会同步结果", "info");
    }

    load(save = true) {
        const day = SignYuba_day();
        const raw = localStorage.getItem(this.key);
        let saved;
        try { saved = raw && JSON.parse(raw); } catch {}
        this.state = saved?.day === day && saved.list && saved.groups ? saved : SignYuba_newState(day);
        for (const group of Object.values(this.state.groups)) {
            if (group.status !== 'pending' && /status_code=1001|今日已签到|今天已签到/.test(group.supplementError || '')) {
                group.supplemented = true;
                group.supplementError = '';
            }
        }
        if (save) this.persist();
    }

    persist() {
        try {
            localStorage.setItem(this.key, JSON.stringify(this.state));
            this.storageError = false;
        } catch {
            this.storageError = true;
            const error = new Error("签到进度无法保存，请检查浏览器存储；恢复保存后会继续签到");
            error.storage = true;
            throw error;
        }
    }

    current() {
        if (this.stopped || String(accountId()) !== this.uid || this.state.day !== SignYuba_day()) {
            const error = new Error("签到日期或登录账号已变化");
            error.interrupted = true;
            throw error;
        }
    }

    retryNow() {
        if (!SignYuba_complete(this.state)) {
            this.state.list.nextAt = 0;
            for (const group of Object.values(this.state.groups)) if (group.status === "pending") group.nextAt = 0;
        }
        this.persist();
    }

    async run() {
        this.current();
        await this.remind();
        if (navigator.onLine === false) {
            if (!SignYuba_complete(this.state) && !this.state.offlineNotified) {
                this.state.offlineNotified = true;
                this.persist();
                this.log("网络已断开，联网后继续", {}, "warn");
            }
            this.status("网络已断开，联网后继续签到，进度已保存。");
            await this.remind();
            return;
        }
        this.state.offlineNotified = false;
        const list = this.state.list;
        // 一次持锁只发一个请求，间隔保存在账号进度中，换页接手也不能跳过。
        if ((this.state.requestAt || 0) <= Date.now()) {
            if (!list.done && list.nextAt <= Date.now()) await this.discover();
            else {
                const groups = Object.values(this.state.groups);
                const pending = groups.filter(group => group.status === "pending" && group.nextAt <= Date.now())
                    .sort((left, right) => left.nextAt - right.nextAt)[0];
                const supplementary = groups.find(group => group.status !== "pending" && !group.supplemented);
                if (pending) await this.sign(pending);
                else if (supplementary) await this.supplement(supplementary);
            }
        }
        this.current();
        if (SignYuba_complete(this.state) && !this.state.notified) {
            this.state.notified = true;
            this.persist();
            const groups = Object.values(this.state.groups);
            const signed = groups.filter(group => group.status === "signed").length;
            const already = groups.length - signed;
            this.log("今日签到完成", { signed, already, total: groups.length });
            this.notify(`【鱼吧】今日签到完成：成功 ${signed} 个，已签到 ${already} 个${groups.length ? "" : "（暂无关注鱼吧）"}`, "success");
        }
        this.updateStatus();
        await this.remind();
    }

    async request(path, options = {}) {
        this.current();
        // 请求中关闭页面时，接手页至少等到本次超时边界，避免立刻重复请求。
        this.state.requestAt = Date.now() + SignYuba_timeout(options.attempt) + SignYuba_gap();
        this.persist();
        this.log("发起请求", { endpoint: path, groupId: options.groupId, attempt: options.attempt || 1 });
        try {
            return await this.api.request(path, options);
        } finally {
            this.current();
            this.state.requestAt = Date.now() + SignYuba_gap();
            this.persist();
        }
    }

    async discover() {
        const list = this.state.list;
        list.attempts++;
        // 发请求前保存下一次时间，刷新中断时仍保留本次尝试与退避。
        list.nextAt = Date.now() + SignYuba_timeout(list.attempts) + SignYuba_delay(list.attempts);
        this.persist();
        try {
            const result = await this.request(`/wbapi/web/group/myFollow?page=${list.page}&limit=30`, { attempt: list.attempts });
            this.current();
            SignYuba_assertResponse(result);
            const data = result.data;
            if (!Array.isArray(data?.list) || !Number.isInteger(Number(data.count_page)) || Number(data.count_page) < 0) {
                throw new Error("关注鱼吧列表格式异常");
            }
            for (const item of data.list) {
                const id = String(item.group_id || "");
                if (!/^\d+$/.test(id)) throw new Error("关注鱼吧缺少有效编号");
                if (!list.ids.includes(id)) list.ids.push(id);
                if (!this.state.groups[id]) {
                    this.state.groups[id] = { id, name: String(item.group_name || item.name || id), status: "pending", attempts: 0, nextAt: 0, error: "" };
                    this.state.notified = false;
                }
            }
            list.pages = Math.max(1, Number(data.count_page));
            this.log("已读取关注名单", { page: list.page, pages: list.pages, found: data.list.length, total: Object.keys(this.state.groups).length });
            list.page++;
            list.done = list.page > list.pages;
            list.attempts = 0; list.nextAt = 0; list.error = "";
            if (list.done) for (const id of Object.keys(this.state.groups)) if (!list.ids.includes(id)) delete this.state.groups[id];
            this.persist();
        } catch (error) {
            if (error.interrupted || error.storage) throw error;
            this.current();
            list.error = error.message;
            list.nextAt = Date.now() + SignYuba_delay(list.attempts);
            this.persist();
            this.failure(`关注名单第 ${list.page} 页`, list.attempts, list.error, list.nextAt);
        }
    }

    async sign(group) {
        group.attempts++;
        group.nextAt = Date.now() + SignYuba_timeout(group.attempts) + SignYuba_delay(group.attempts);
        this.persist();
        try {
            const result = await this.request("/ybapi/topic/sign", { method: "POST", data: `group_id=${encodeURIComponent(group.id)}`, groupId: group.id, attempt: group.attempts });
            this.current();
            group.status = SignYuba_signResult(result);
            group.error = ""; group.nextAt = 0;
            this.persist();
            this.log(group.status === "already" ? "确认已签到" : "签到成功", { groupId: group.id, name: group.name, attempt: group.attempts });
        } catch (error) {
            if (error.interrupted || error.storage) throw error;
            this.current();
            group.error = error.message;
            group.nextAt = Date.now() + SignYuba_delay(group.attempts);
            this.persist();
            this.failure(group.name, group.attempts, group.error, group.nextAt, group.id);
            return;
        }
    }

    async supplement(group) {
        if (group.supplemented) return;
        try {
            const result = await this.request("https://mapi-yuba.douyu.com/wb/v3/supplement", { method: "POST", data: `group_id=${encodeURIComponent(group.id)}`, groupId: group.id, mobile: true });
            this.current();
            if (SignYuba_supplementComplete(result)) {
                group.supplemented = true; group.supplementError = '';
                this.persist();
                this.log("今日已签到，无需继续补签", { groupId: group.id, name: group.name });
                return;
            }
            SignYuba_assertResponse(result);
            group.supplementRemaining = group.supplementRemaining == null
                ? Math.max(0, Number(result.data?.supplementary_cards) || 0)
                : Math.max(0, group.supplementRemaining - 1);
            group.supplemented = group.supplementRemaining === 0;
            this.persist();
            this.log(group.supplemented ? "补签处理完成" : "补签等待下一轮", { groupId: group.id, name: group.name, remaining: group.supplementRemaining });
        } catch (error) {
            if (error.interrupted || error.storage) throw error;
            this.current();
            group.supplemented = true;
            group.supplementError = error.message;
            this.persist();
            this.log("补签失败，保留今日签到结果", { groupId: group.id, name: group.name, reason: error.message }, "warn");
        }
    }

    failure(name, attempts, error, nextAt, groupId) {
        this.log("未完成，等待自动重试", { groupId, name, attempt: attempts, reason: error, nextAt: new Date(nextAt).toISOString() }, "warn");
        this.updateStatus();
    }

    log(event, detail = {}, level = "info") {
        console[level](`[观鱼][鱼吧签到][页面 ${this.pageId}] ${event}`, {
            time: new Date().toISOString(), uid: this.uid, day: this.state?.day, ...detail
        });
    }

    async remind() {
        if (this.stopped || this.reminderBusy || !navigator.locks) return;
        const uid = accountId();
        if (!uid) return;
        this.reminderBusy = true;
        try {
            // 提醒独立于长请求，后台页持有签到锁时，前台页仍可按时提醒。
            await navigator.locks.request(`guanyu:yuba:${uid}:reminder`, { ifAvailable: true }, lock => {
                if (!lock) return;
                const key = `guanyu:yuba:v1:${uid}`;
                const raw = localStorage.getItem(key);
                const state = raw && JSON.parse(raw);
                if (state?.day === SignYuba_day()) this.showReminder(uid, key, state);
            });
            this.reminderError = false;
        } catch {
            if (!this.reminderError) this.notify("【鱼吧】晚间提醒记录无法读取或保存，请检查浏览器存储", "error");
            this.reminderError = true;
        } finally { this.reminderBusy = false; }
    }

    showReminder(uid, key, state) {
        const settings = this.settings.value.sign;
        const clock = new Date(Date.now() + 8 * 3600000).toISOString().slice(11, 16);
        if (!settings.reminderEnabled || localStorage.getItem(`${key}:reminder`) === state.day || SignYuba_complete(state) || clock < settings.reminderTime) return;
        if (document.hidden || document.fullscreenElement || document.querySelector("dialog[open]")) return;
        const pending = Object.values(state.groups).filter(group => group.status === "pending");
        if (!state.list.error && !state.offlineNotified && !pending.some(group => group.attempts > 0)) return;
        localStorage.setItem(`${key}:reminder`, state.day);
        this.log("显示晚间未完成提醒", { pending: pending.length, listComplete: state.list.done });
        const names = pending.slice(0, 5).map(group => group.name).join("、");
        this.reminder({
            title: "鱼吧今日签到尚未完成",
            content: `${pending.length ? `还有 ${pending.length} 个鱼吧未确认签到：${names}${pending.length > 5 ? "等" : ""}。` : "暂时无法确认全部关注鱼吧的签到结果。"}${state.list.done ? "" : "关注名单也尚未读取完整。"}可以前往鱼吧检查，自动重试会继续。`,
        });
    }

    status(message) {
        this.report(this, message);
    }

    updateStatus() {
        const groups = Object.values(this.state.groups);
        const pending = groups.filter(group => group.status === "pending");
        const signed = groups.filter(group => group.status === "signed").length;
        const already = groups.filter(group => group.status === "already").length;
        const error = this.state.list.error || pending.find(group => group.error)?.error;
        this.status(`北京时间 ${this.state.day}：成功 ${signed} 个，已签到 ${already} 个，待确认 ${pending.length} 个。${this.state.list.done ? "" : "关注名单尚未读取完整。"}${this.waiting ? "其他页面正在处理。" : ""}${error ? ` 最近失败：${error}。` : ""}进度自动保存，失败项静默重试。`);
    }

    schedule() {
        if (this.stopped) return;
        let delay = 30000;
        if (!this.storageError && !this.waiting && this.state && navigator.onLine !== false) {
            const now = Date.now();
            const due = [];
            if (!this.state.list.done) due.push(this.state.list.nextAt);
            for (const group of Object.values(this.state.groups)) {
                if (group.status === "pending") due.push(group.nextAt);
                else if (!group.supplemented) due.push(0);
            }
            if (due.length) delay = Math.max(500, Math.min(delay, Math.max(this.state.requestAt || 0, Math.min(...due)) - now));
            const settings = this.settings.value.sign;
            const midnight = Date.parse(`${this.state.day}T00:00:00+08:00`) + 86400000;
            delay = Math.max(500, Math.min(delay, midnight - now));
            if (settings.reminderEnabled && !SignYuba_complete(this.state)) {
                const at = Date.parse(`${this.state.day}T${settings.reminderTime}:00+08:00`);
                if (at > now) delay = Math.min(delay, at - now);
            }
        }
        this.timer = setTimeout(() => void this.wake(), delay);
    }
}
