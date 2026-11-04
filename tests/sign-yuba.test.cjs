const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// 只验证用户要求的本地调度契约，合成响应不代表鱼吧线上接口样本。
const ts = require("typescript");
const requestSource = ts.transpileModule(readFileSync(path.join(__dirname, "../src/adapters/douyu/task-request.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const source = requestSource + "\n" + ["yuba-response.js", "yuba.js"].map(file =>
    readFileSync(path.join(__dirname, "../src/features/sign", file), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")
).join("\n");
const noon = Date.parse("2026-10-26T12:00:00+08:00");
const failure = { error: 9001, message: "临时请求失败" };
const success = { error: 0, message: "", data: { count: 1, exp: 3 } };
const list = (ids = ["1"], pages = 1) => ({ error: 0, data: {
    count_page: pages, list: ids.map(id => ({ group_id: id, group_name: `鱼吧${id}` }))
} });

function events() {
    const listeners = new Map();
    return {
        addEventListener(name, fn) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(fn);
        },
        removeEventListener(name, fn) {
            listeners.set(name, (listeners.get(name) || []).filter(listener => listener !== fn));
        },
        emit(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); }
    };
}

function locks() {
    const held = new Set();
    return { async request(name, options, run) {
        if (held.has(name)) return run(null);
        held.add(name);
        try { return await run({ name }); } finally { held.delete(name); }
    } };
}

async function flush() {
    for (let i = 0; i < 30; i++) await Promise.resolve();
}

async function browser(options = {}) {
    const store = options.store || new Map();
    const clock = options.clock || { now: noon };
    const requests = [], messages = [], dialogs = [], statuses = [], logs = [];
    const timers = new Map();
    let timerId = 0, uid = "101";
    const window = events();
    const document = Object.assign(events(), {
        hidden: !!options.hidden, fullscreenElement: null, querySelector: () => null
    });
    Object.defineProperty(document, 'cookie', { get: () => `acf_uid=${uid}; acf_biz=test; acf_stk=test; acf_ct=test; acf_ltkid=test` });
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [clock.now])); }
        static now() { return clock.now; }
    }
    const context = vm.createContext({
        Date: ClockDate, window, document, AbortController, URLSearchParams, exports: {},
        require: name => { if (name === "$") return { GM_xmlhttpRequest: args => context.GM_xmlhttpRequest(args) }; throw new Error(`未支持模块 ${name}`); },
        console: Object.fromEntries(["info", "warn", "error"].map(level => [level, (...args) => logs.push({ level, args })])),
        navigator: { onLine: true, locks: options.locks === undefined ? locks() : options.locks },
        localStorage: {
            getItem: key => store.get(key) ?? null,
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: key => store.delete(key)
        },
        setTimeout: (fn, delay) => {
            const id = ++timerId;
            timers.set(id, { fn, at: clock.now + delay });
            return id;
        },
        setInterval: (fn, delay) => {
            const id = ++timerId;
            timers.set(id, { fn, at: clock.now + delay, repeat: delay });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        clearInterval: id => timers.delete(id),
        GM_xmlhttpRequest: args => {
            const request = {
                args, uid, at: clock.now, aborted: false,
                respond(result, status = 200) { args.onload({ status, response: result }); },
                fail() { args.onerror(); }
            };
            requests.push(request);
            queueMicrotask(() => {
                if (options.reply) { options.reply(request); return; }
                if (args.url.includes("myFollow")) request.respond(list());
                else if (args.url.includes("/supplement")) request.respond({ error: 0, data: { supplementary_cards: 0 } });
                else request.respond(failure);
            });
            return { abort() { request.aborted = true; args.onabort(); } };
        }
    });
    vm.runInContext(source, context);
    const Controller = vm.runInContext("SignYubaController", context);
    const apiRequest = vm.runInContext("createTaskRequest(localStorage)", context);
    const controller = new Controller(
        { get value() { return { sign: options.settings || { reminderEnabled: false, reminderTime: "23:50" } }; } },
        apiRequest, (controller, message) => statuses.push(message),
        (message, type) => messages.push({ message, type }), dialog => dialogs.push(dialog)
    );
    const api = {
        store, clock, requests, messages, dialogs, statuses, logs, document, window,
        state(account = uid) { return JSON.parse(store.get(`guanyu:yuba:v1:${account}`)); },
        signRequests() { return requests.filter(request => request.args.url.includes("/topic/sign")); },
        setAccount(account) { uid = account; },
        async wake(manual = false) { await controller.wake(manual); await flush(); },
        close() { controller.dispose(); },
        async advanceUntil(check) {
            for (let steps = 0; steps < 500; steps++) {
                if (check()) return;
                const next = Math.min(...[...timers.values()].map(timer => timer.at));
                if (!Number.isFinite(next)) break;
                await api.advanceTo(next);
            }
            throw new Error("等待的调度结果未出现");
        },
        async advanceTo(target) {
            for (let steps = 0; steps < 1000; steps++) {
                const next = [...timers].filter(([, timer]) => timer.at <= target)
                    .sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) { clock.now = target; await flush(); return; }
                timers.delete(next[0]); clock.now = next[1].at;
                if (next[1].repeat) timers.set(next[0], { ...next[1], at: clock.now + next[1].repeat });
                next[1].fn(); await flush();
            }
            throw new Error("虚拟计时器未能收敛");
        }
    };
    controller.start();
    await flush();
    return api;
}

test("失败响应不报完成，刷新保留次数和等待时间并继续重试", async () => {
    const first = await browser();
    await first.advanceUntil(() => first.signRequests().length === 1);
    const saved = first.state().groups["1"];
    assert.equal(saved.status, "pending");
    assert.equal(saved.attempts, 1);
    assert.ok(saved.nextAt > first.clock.now);
    assert.equal(first.messages.length, 0);
    assert.match(saved.error, /9001/);
    assert.ok(first.logs.some(item => item.level === "warn" && item.args[1].reason === saved.error));
    assert.ok(first.messages.every(item => item.type !== "success"));
    first.close();

    const restored = await browser({ store: first.store, clock: first.clock });
    assert.equal(restored.signRequests().length, 0);
    assert.equal(restored.state().groups["1"].attempts, 1);
    assert.equal(restored.state().groups["1"].nextAt, saved.nextAt);
    await restored.advanceTo(saved.nextAt - 1);
    assert.equal(restored.signRequests().length, 0);
    await restored.advanceTo(saved.nextAt);
    assert.equal(restored.signRequests().length, 1);
    const retried = restored.state().groups["1"];
    assert.equal(retried.attempts, 2);
    assert.ok(retried.nextAt - restored.clock.now >= saved.nextAt - first.signRequests()[0].at);
    assert.equal(restored.messages.length, 0);
    assert.ok(!JSON.stringify(restored.state()).includes("credential-for-"));
});

test("失败超过十次仍重试，等待和请求超时递增但保持有限", async () => {
    const page = await browser();
    await page.advanceUntil(() => page.signRequests().length === 1);
    let previousWait = 0, previousTimeout = 0;
    while (page.state().groups["1"].attempts < 13) {
        const group = page.state().groups["1"];
        const wait = group.nextAt - page.clock.now;
        const timeout = page.signRequests().at(-1).args.timeout;
        assert.ok(wait >= previousWait && wait > 0 && wait <= 300000);
        assert.ok(timeout >= previousTimeout && timeout > 0 && timeout <= 60000);
        previousWait = wait; previousTimeout = timeout;
        await page.advanceTo(group.nextAt);
    }
    assert.equal(page.signRequests().length, 13);
    assert.equal(page.state().groups["1"].status, "pending");
    assert.ok(page.messages.every(item => item.type !== "success"));
});

test("请求超时后仍可重试，迟到成功回调不能把失败项变成完成", async () => {
    const page = await browser({ reply(request) {
        if (request.args.url.includes("myFollow")) request.respond(list());
    } });
    await page.advanceUntil(() => page.signRequests().length === 1);
    const first = page.signRequests()[0];
    await page.advanceTo(first.at + first.args.timeout);
    assert.ok(first.aborted);
    assert.equal(page.state().groups["1"].status, "pending");
    assert.equal(page.messages.length, 0);
    assert.match(page.state().groups["1"].error, /未响应/);
    const deadline = page.state().groups["1"].nextAt;
    first.respond(success);
    await flush();
    assert.equal(page.state().groups["1"].status, "pending");
    await page.advanceTo(deadline);
    assert.equal(page.signRequests().length, 2);
    page.signRequests()[1].respond(success);
    await flush();
    assert.equal(page.state().groups["1"].status, "signed");
    assert.ok(page.messages.some(item => item.type === "success"));
    first.fail();
    await flush();
    assert.equal(page.state().groups["1"].status, "signed");
});

test("北京时间跨零点建立新一天的任务，不沿用昨天的成功或失败次数", async () => {
    const clock = { now: Date.parse("2026-10-26T23:59:50+08:00") };
    const page = await browser({ clock });
    await page.advanceUntil(() => page.signRequests().length === 1);
    assert.equal(page.state().day, "2026-10-26");
    await page.advanceTo(Date.parse("2026-10-27T00:00:00+08:00"));
    assert.equal(page.state().day, "2026-10-27");
    assert.equal(page.state().groups["1"].attempts, 0);
    await page.advanceUntil(() => page.signRequests().length === 2);
    assert.equal(page.state().groups["1"].attempts, 1);
    assert.equal(page.signRequests().length, 2);
});

test("晚间提醒按设定时间每日一次，刷新后不重复；关闭提醒仍会静默重试", async () => {
    const settings = { reminderEnabled: true, reminderTime: "23:50" };
    const page = await browser({ settings, clock: { now: Date.parse("2026-10-26T23:49:50+08:00") } });
    await page.advanceUntil(() => page.signRequests().length === 1);
    assert.equal(page.dialogs.length, 0);
    await page.advanceTo(Date.parse("2026-10-26T23:50:00+08:00"));
    assert.equal(page.dialogs.length, 1);
    await page.wake();
    assert.equal(page.dialogs.length, 1);
    page.close();
    const restored = await browser({ settings, store: page.store, clock: page.clock });
    assert.equal(restored.dialogs.length, 0);

    const disabled = await browser({ clock: page.clock, settings: { reminderEnabled: false, reminderTime: "23:50" } });
    await disabled.advanceUntil(() => disabled.signRequests().length === 1);
    assert.equal(disabled.dialogs.length, 0);
    assert.equal(disabled.messages.length, 0);
    await disabled.advanceTo(disabled.state().groups["1"].nextAt);
    assert.equal(disabled.signRequests().length, 2);
});

test("后台错过晚间提醒时，回到前台补提示", async () => {
    const page = await browser({ hidden: true,
        settings: { reminderEnabled: true, reminderTime: "23:50" },
        clock: { now: Date.parse("2026-10-26T23:50:00+08:00") }
    });
    await page.advanceUntil(() => page.signRequests().length === 1);
    assert.equal(page.dialogs.length, 0);
    page.document.hidden = false;
    page.document.emit("visibilitychange");
    await flush();
    assert.equal(page.dialogs.length, 1);
});

test("关注名单分页失败不会阻断已发现的鱼吧，之后仍会补齐名单", async () => {
    let pageTwo = 0, signs = 0;
    const page = await browser({ reply(request) {
        const url = new URL(request.args.url);
        if (url.pathname.includes("myFollow")) {
            if (url.searchParams.get("page") === "1") request.respond(list(["1"], 2));
            else if (++pageTwo <= 2) request.fail();
            else request.respond(list(["2"], 2));
        } else if (url.pathname.includes("/topic/sign")) request.respond(++signs === 1 ? failure : success);
        else request.respond({ error: 0, data: { supplementary_cards: 0 } });
    } });
    await page.advanceUntil(() => !!page.state().list.error);
    assert.equal(page.state().list.done, false);
    assert.ok(page.state().list.error);
    await page.advanceUntil(() => page.state().groups["1"].status === "signed");
    assert.equal(page.state().groups["1"].status, "signed");
    assert.equal(page.state().list.done, false);
    assert.ok(page.messages.every(item => item.type !== "success"));
    await page.advanceUntil(() => page.state().list.done);
    assert.equal(page.state().list.done, true);
    await page.advanceUntil(() => page.state().groups["2"].status === "signed");
    assert.equal(page.state().groups["2"].status, "signed");
    assert.ok(page.messages.some(item => item.type === "success"));
});

test("同站多页不会同时发起同一账号的签到，账号切换不会混写进度", async () => {
    const sharedLocks = locks();
    const first = await browser({ locks: sharedLocks, reply(request) {
        if (request.args.url.includes("myFollow")) request.respond(list());
    } });
    await first.advanceUntil(() => first.signRequests().length === 1);
    const second = await browser({ locks: sharedLocks, store: first.store, clock: first.clock });
    assert.equal(second.requests.length, 0);
    first.setAccount("202");
    first.signRequests()[0].respond(success);
    await flush();
    assert.equal(first.state("101").groups["1"].status, "pending");
    const switched = first.wake();
    await flush();
    await switched;
    await first.advanceUntil(() => first.signRequests().length === 2);
    assert.equal(first.signRequests().length, 2);
    assert.equal(first.signRequests()[1].uid, "202");
    assert.equal(first.state("202").groups["1"].attempts, 1);
    first.signRequests()[1].respond(failure);
    await flush();
});

test("后台页面持有签到锁时，前台页面仍会按时提醒", async () => {
    const sharedLocks = locks();
    const settings = { reminderEnabled: true, reminderTime: "23:50" };
    const background = await browser({ hidden: true, locks: sharedLocks, settings,
        clock: { now: Date.parse("2026-10-26T23:50:00+08:00") },
        reply(request) { if (request.args.url.includes("myFollow")) request.respond(list()); }
    });
    await background.advanceUntil(() => background.signRequests().length === 1);
    assert.equal(background.signRequests().length, 1);
    assert.equal(background.dialogs.length, 0);
    const foreground = await browser({ locks: sharedLocks, settings,
        store: background.store, clock: background.clock });
    assert.equal(foreground.requests.length, 0);
    assert.equal(foreground.dialogs.length, 1);
    background.signRequests()[0].respond(failure);
    await flush();
});

test("浏览器无法提供跨页互斥时明确提示，不发送可能重复的签到请求", async () => {
    const page = await browser({ locks: null });
    assert.equal(page.requests.length, 0);
    assert.ok(page.messages.some(item => item.type === "error"));
});

test("名单、签到和补签均有间隔，另一页面接手和手动触发不能跳过", async () => {
    const sharedLocks = locks();
    const reply = request => {
        if (request.args.url.includes("myFollow")) request.respond(list(["1", "2"]));
        else if (request.args.url.includes("/topic/sign")) request.respond(success);
        else request.respond({ error: 0, data: { supplementary_cards: 2 } });
    };
    const first = await browser({ locks: sharedLocks, reply });
    const firstDue = first.state().requestAt;
    first.close();
    const second = await browser({ locks: sharedLocks, store: first.store, clock: first.clock, reply });
    await second.wake(true);
    assert.equal(second.requests.length, 0);
    await second.advanceTo(firstDue - 1);
    assert.equal(second.requests.length, 0);
    await second.advanceUntil(() => Object.values(second.state().groups).every(group => group.supplemented));
    const requests = [...first.requests, ...second.requests];
    assert.equal(second.signRequests().length, 2);
    assert.equal(requests.filter(request => request.args.url.includes("/supplement")).length, 6);
    for (let i = 1; i < requests.length; i++) {
        assert.ok(requests[i].at - requests[i - 1].at >= 3000);
        assert.ok(requests[i].at - requests[i - 1].at <= 5000);
    }
    assert.equal(second.messages.filter(item => item.type === "success").length, 1);
});

test("明确已签到的附加说明计入完成，真正失败保留错误码且不刷通知", async () => {
    const results = {
        1: { error: 1, message: "您已签到，请勿重复签到！" },
        2: { error: 9001, message: "签到失败" },
        3: success
    };
    const page = await browser({ reply(request) {
        if (request.args.url.includes("myFollow")) request.respond(list(["1", "2", "3"]));
        else request.respond(results[new URLSearchParams(request.args.data).get("group_id")]);
    } });
    await page.advanceUntil(() => page.signRequests().length === 3);
    assert.equal(page.state().groups["1"].status, "already");
    assert.equal(page.state().groups["2"].status, "pending");
    assert.match(page.state().groups["2"].error, /签到失败.*9001/);
    assert.equal(page.state().groups["3"].status, "signed");
    assert.ok(page.statuses.some(message => /成功 1 个，已签到 1 个，待确认 1 个/.test(message)));
    assert.equal(page.messages.length, 0);
    assert.ok(page.logs.every(item => /^\[观鱼\]\[鱼吧签到\]\[页面 [a-z0-9]+\]/.test(item.args[0])));
    assert.ok(page.logs.some(item => item.args[0].includes("确认已签到")));
    assert.ok(page.logs.some(item => item.args[0].includes("签到成功")));
    assert.ok(!JSON.stringify(page.logs).includes("credential-for-"));
});

test("HTTP 错误记录接口原因，补签失败不撤销今日签到也不弹错误通知", async () => {
    const page = await browser({ reply(request) {
        if (request.args.url.includes("myFollow")) request.respond(list(["1", "2"]));
        else if (request.args.url.includes("/supplement")) request.respond({ error: 9002, message: "补签请求失败" });
        else if (request.args.data === "group_id=1") request.respond(success);
        else request.respond({ error: 9003, message: "请求被拒绝" }, 403);
    } });
    await page.advanceUntil(() => page.state().groups["1"].supplemented);
    assert.equal(page.state().groups["1"].status, "signed");
    assert.match(page.state().groups["1"].supplementError, /补签请求失败.*9002/);
    assert.match(page.state().groups["2"].error, /HTTP 403.*请求被拒绝.*9003/);
    assert.equal(page.messages.length, 0);
});
