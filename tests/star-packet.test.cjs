const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, imports = {}, globals = {}) {
  const exports = {};
  let account;
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, setTimeout, clearTimeout,
    require(name) { if (name in imports) return imports[name]; if (name === './account') return account ||= load('src/adapters/douyu/account.ts', { $: imports.$ || {} }, globals); throw new Error(`未支持模块 ${name}`); }, ...globals,
  }, { filename: file });
  return exports;
}

const core = load('src/core/state.ts');
const config = load('src/config/sign.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const startTime = Date.parse('2026-11-10T23:00:00+08:00');
const bag = { id: '101', code: 'contract-redbag-nonce', status: 0, rbType: 7, waitSec: 0 };

function session(options = {}) {
  const clock = options.clock || { now: startTime }, values = options.values || new Map(), locks = options.locks || new Set();
  const timers = clock.timers ||= new Map(), listeners = new Map(), requests = [], forms = [];
  let active = 0, peak = 0, aborted = 0;
  const after = (run, ms, repeat = 0) => { const id = {}; timers.set(id, { run, at: clock.now + ms, repeat }); return id; };
  const timing = { setTimeout: (run, ms) => after(run, ms), clearTimeout: id => timers.delete(id),
    setInterval: (run, ms) => after(run, ms, ms), clearInterval: id => timers.delete(id) };
  const wait = ms => new Promise(resolve => timing.setTimeout(resolve, ms));
  let room = '12899578', uid = 'contract-account', csrf = true;
  const FakeDate = class extends Date { static now() { return clock.now; } };
  const helpers = load('src/adapters/douyu/task-request.ts', { $: {} }, { Date: FakeDate,
    document: { get cookie() { return `acf_uid=${uid}; acf_biz=1; acf_stk=contract-stk; acf_ct=0; acf_ltkid=contract-ltk; ${csrf ? 'acf_ccn=contract-csrf' : ''}`; } },
  });
  const fetch = async (url, request = {}) => {
    assert.equal(request.credentials, 'include');
    requests.push(url);
    const snatch = url.endsWith('/redbag/snatch');
    if (snatch) { active++; peak = Math.max(peak, active); }
    let cancel;
    const cancellation = new Promise((_, reject) => {
      cancel = () => { if (snatch) aborted++; reject(new DOMException('已取消', 'AbortError')); };
      request.signal.addEventListener('abort', cancel, { once: true });
      if (request.signal.aborted) cancel();
    });
    try {
      const result = await Promise.race([cancellation, (async () => {
      if (url.endsWith('getCsrfCookie')) { if (options.prepareDelay) await wait(options.prepareDelay); csrf = true; return { error: 0 }; }
      if (url.includes('/room/list?')) {
        const rid = new URL(url, 'https://www.douyu.com').searchParams.get('rid');
        const list = typeof options.list === 'function' ? await options.list(rid, clock.now) : options.list || [];
        return { error: 0, data: JSON.stringify({ cnt: list.length, rid: Number(rid), anchorName: '契约房间', anchorAvatar: '', redBagList: list }) };
      }
      assert.ok(snatch); assert.equal(request.method, 'POST');
      forms.push({ at: clock.now, data: Object.fromEntries(new URLSearchParams(request.body)) });
      return options.claim ? await options.claim(forms.length, { wait, signal: request.signal, at: clock.now }) : { error: 0, data: '{"prizeList":[]}' };
      })()]);
      return { ok: !options.httpError || !snatch, status: snatch && options.httpError || 200,
        async json() { if (snatch && options.invalidJson) throw new SyntaxError('非 JSON 响应'); return result; } };
    } finally { request.signal.removeEventListener('abort', cancel); if (snatch) active--; }
  };
  const api = load('src/adapters/douyu/star-packet.ts', { './task-request': helpers }, { Date: FakeDate, fetch, AbortController, ...timing });
  const feature = load('src/features/sign/star-packet.ts', {
    '../../core/state': core, '../../core/diagnostics': { diagnostics: { report() {} } },
    '../../adapters/douyu/star-packet': api,
    '../../adapters/douyu/task-request': { ...helpers, createTaskRequest() { throw new Error('红包不得进入签到慢队列'); } },
  }, {
    Date: FakeDate, AbortController, ...timing,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    navigator: { locks: { async request(name, _options, run) {
      if (locks.has(name)) return run(null);
      locks.add(name); try { return await run({}); } finally { locks.delete(name); }
    } } },
    window: { addEventListener(name, run) { listeners.set(name, run); }, removeEventListener(name) { listeners.delete(name); } },
  });
  const settings = core.createState({ sign: { ...config.signDefaults, ...options.sign } });
  const start = () => feature.createStarPacket(settings, () => room);
  return { clock, values, forms, requests, settings, start, get active() { return active; }, get peak() { return peak; }, get aborted() { return aborted; }, noCsrf() { csrf = false; },
    room(value) { room = value; }, uid(value) { uid = value; },
    async tick(ms = 1000) {
      const target = clock.now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; clock.now = timer.at;
        if (timer.repeat) timer.at += timer.repeat; else timers.delete(id);
        timer.run(); await flush();
      }
      clock.now = target; await flush();
    },
  };
}

test('红包默认开启，旧配置缺少新开关时回填，已保存关闭选择保留', () => {
  assert.equal(config.readSignOptions({}).starPacket, true);
  assert.equal(config.readSignOptions({ starPacket: false }).starPacket, false);
});

test('按 2026-11-10 官方真实空列表识别无红包，不提交领取', async () => {
  const env = session(); const feature = env.start();
  try { await flush(); assert.equal(env.forms.length, 0); assert.match(feature.value.status, /暂无待领红包/); }
  finally { feature.dispose(); }
});

test('依据官方 waitSec，在预计开抢前最后两秒精确发送官方表单', async () => {
  const env = session({ list: [{ ...bag, waitSec: 5 }] }); const feature = env.start();
  try {
    await flush(); assert.equal(env.forms.length, 0);
    await env.tick(2999); assert.equal(env.forms.length, 0);
    await env.tick(1); assert.equal(env.forms.length, 1);
    assert.equal(env.forms[0].at, startTime + 3000);
    assert.deepEqual(env.forms[0].data, { code: bag.code, id: '101', rid: '12899578', ctn: 'contract-csrf' });
    assert.equal(feature.value.received, 1);
  } finally { feature.dispose(); }
});

test('成功后定时检查、手动检查、刷新接手均不重复领取同一红包', async () => {
  const env = session({ list: [bag] }); let feature = env.start();
  try {
    await flush(); assert.equal(env.forms.length, 1);
    await env.tick(31000); await feature.run(); assert.equal(env.forms.length, 1);
    feature.dispose(); feature = env.start(); await flush(); await feature.run();
    assert.equal(env.forms.length, 1); assert.equal(feature.value.received, 1);
    assert.ok([...env.values.values()].every(value => !value.includes(bag.code)));
  } finally { feature.dispose(); }
});

test('同账号同房间两个页面并发检查，只提交一次领取', async () => {
  const shared = { clock: { now: startTime }, values: new Map(), locks: new Set(), list: [bag] };
  const one = session(shared), two = session(shared), first = one.start(), second = two.start();
  try {
    await flush(); await two.tick(2000); await second.run();
    assert.equal(one.forms.length + two.forms.length, 1);
    assert.equal(second.value.received, 1);
  } finally { first.dispose(); second.dispose(); }
});

test('官方已领取、已抢完、已过期的红包不再提交', async () => {
  const env = session({ list: [{ ...bag, status: 4 }, { ...bag, id: '102', status: 3 }, { ...bag, id: '103', status: 10 }] });
  const feature = env.start();
  try { await flush(); assert.equal(env.forms.length, 0); assert.equal(feature.value.received, 1); }
  finally { feature.dispose(); }
});

test('官方 12001 记录抢完，明确失败立即终止且不误报成功', async () => {
  for (const [error, state] of [[12001, 'exhausted'], [12002, 'failed']]) {
    const env = session({ list: [bag], claim: async () => ({ error, msg: '官方领取结果' }) }); const feature = env.start();
    try {
      await flush(); assert.equal(feature.value.received, 0); assert.equal(env.forms.length, 1);
      const saved = JSON.parse([...env.values.values()][0]); assert.equal(saved.records['101'].status, state);
      await env.tick(1000); assert.equal(env.forms.length, 1);
      await env.tick(60000); assert.equal(env.forms.length, 1);
    } finally { feature.dispose(); }
  }
});

test('空列表按一分钟轮询，倒计时与毫秒级发送独立于签到慢队列', async () => {
  const env = session(); const feature = env.start();
  try {
    await flush(); assert.equal(env.requests.length, 1);
    await env.tick(59999); assert.equal(env.requests.length, 1);
    await env.tick(1); assert.equal(env.requests.length, 2);
  } finally { feature.dispose(); }
});

test('12006 在末两秒连续尝试，成功即停止并核对下一红包', async () => {
  const env = session({ list: [{ ...bag, waitSec: 5 }], claim: async (_n, { at }) => ({ error: at < startTime + 5000 ? 12006 : 0 }) });
  const feature = env.start();
  try {
    await flush(); await env.tick(3000); assert.equal(env.forms.length, 1);
    await env.tick(2000);
    assert.equal(env.forms.length, 9); assert.equal(feature.value.received, 1);
    assert.ok(env.forms.every((form, i) => form.at === startTime + 3000 + i * 250));
    assert.equal(env.requests.filter(url => url.includes('/room/list?')).length, 2);
    await env.tick(60000); assert.equal(env.forms.length, 9);
  } finally { feature.dispose(); }
});

test('慢响应最多两个在途请求，成功后立即取消竞争请求', async () => {
  const env = session({ list: [{ ...bag, waitSec: 5 }], claim: async (n, { wait }) => {
    await wait(1000); return { error: n < 3 ? 12006 : 0 };
  } }); const feature = env.start();
  try {
    await flush(); await env.tick(3250);
    assert.equal(env.forms.length, 2); assert.equal(env.active, 2);
    await env.tick(500); assert.equal(env.forms.length, 2);
    await env.tick(1500); assert.equal(env.peak, 2); assert.equal(env.active, 0);
    assert.equal(feature.value.received, 1); assert.ok(env.aborted >= 1);
    const count = env.forms.length; await env.tick(60000); assert.equal(env.forms.length, count);
  } finally { feature.dispose(); }
});

test('一直可重试或网络无响应时到截止即停止，刷新后也不重抢同一红包', async () => {
  for (const claim of [async () => ({ error: 12006 }), () => new Promise(() => {})]) {
    const env = session({ list: [{ ...bag, waitSec: 5 }], claim }); let feature = env.start();
    try {
      await flush(); await env.tick(7000);
      const count = env.forms.length;
      assert.ok(count > 1); assert.equal(env.active, 0); assert.ok(env.peak <= 2);
      assert.ok(env.forms.every(form => form.at >= startTime + 3000 && form.at < startTime + 7000));
      assert.equal(JSON.parse([...env.values.values()][0]).records['101'].status, 'failed');
      assert.equal(feature.value.received, 0);
      feature.dispose(); feature = env.start(); await flush(); await feature.run();
      await env.tick(60000); assert.equal(env.forms.length, count);
    } finally { feature.dispose(); }
  }
});

test('HTTP 429 立即停止，不在限流响应后继续发送', async () => {
  for (const invalidJson of [false, true]) {
    const env = session({ list: [bag], httpError: 429, invalidJson, claim: async () => ({ msg: '请求过于频繁' }) }); const feature = env.start();
    try {
      await flush(); await env.tick(60000);
      assert.equal(env.forms.length, 1); assert.equal(feature.value.received, 0);
    } finally { feature.dispose(); }
  }
});

test('关闭开关或总开关后不查询；倒计时期间关闭后不领取', async () => {
  for (const sign of [{ starPacket: false }, { enabled: false }]) {
    const env = session({ sign, list: [bag] }); const feature = env.start();
    try { await flush(); assert.equal(env.requests.length, 0); }
    finally { feature.dispose(); }
  }
  const env = session({ list: [{ ...bag, waitSec: 5 }] }); const feature = env.start();
  try {
    await flush(); env.settings.set({ sign: { ...env.settings.value.sign, starPacket: false } });
    await env.tick(6000); assert.equal(env.forms.length, 0); assert.match(feature.value.status, /已关闭/);
  } finally { feature.dispose(); }
});

test('列表在途换房、换账号或释放时，不领取旧上下文的红包', async () => {
  for (const action of ['room', 'uid', 'dispose']) {
    let release;
    const env = session({ list: () => new Promise(resolve => { release = resolve; }) }); const feature = env.start();
    try {
      if (action === 'dispose') feature.dispose(); else env[action](action === 'room' ? '12899565' : 'other-account');
      release([bag]); await flush(); assert.equal(env.forms.length, 0);
    } finally { feature.dispose(); }
  }
});

test('缺少 CSRF Cookie 时沿官方入口生成，发送时读取最新防伪参数', async () => {
  const env = session({ list: [{ ...bag, waitSec: 5 }], prepareDelay: 1000 }); env.noCsrf(); const feature = env.start();
  try {
    await flush(); assert.ok(env.requests.some(url => url.endsWith('/csrfApi/getCsrfCookie')));
    assert.equal(env.forms.length, 0); await env.tick(3000);
    assert.equal(env.forms[0].at, startTime + 3000);
    assert.equal(env.forms[0].data.ctn, 'contract-csrf'); assert.equal(feature.value.received, 1);
  } finally { feature.dispose(); }
});

test('抢领期间关闭、换房、换号或释放会取消两个在途请求和后续发送', async () => {
  for (const action of ['off', 'room', 'uid', 'dispose']) {
    const env = session({ list: (_rid, now) => now === startTime ? [{ ...bag, waitSec: 5 }] : [], claim: () => new Promise(() => {}) });
    const feature = env.start();
    try {
      await flush(); await env.tick(3250); assert.equal(env.active, 2);
      if (action === 'dispose') feature.dispose();
      else if (action === 'off') env.settings.set({ sign: { ...env.settings.value.sign, starPacket: false } });
      else env[action](action === 'room' ? '12899565' : 'other-account');
      await env.tick(5000);
      assert.equal(env.active, 0); assert.equal(env.forms.length, 2); assert.equal(env.aborted, 2);
      assert.equal(feature.value.received, 0);
    } finally { feature.dispose(); }
  }
});

test('跨页锁覆盖整个连续抢领窗口，其他页面不会并行启动另一轮', async () => {
  const shared = { clock: { now: startTime }, values: new Map(), locks: new Set(),
    list: (_rid, now) => [{ ...bag, waitSec: Math.max(0, Math.ceil((startTime + 5000 - now) / 1000)) }],
    claim: async (_n, { wait }) => { await wait(700); return { error: 12006 }; } };
  const one = session(shared), two = session(shared), first = one.start(), second = two.start();
  try {
    await flush(); await one.tick(8000);
    const count = one.forms.length + two.forms.length;
    assert.ok(count > 1); assert.ok(one.forms.length === 0 || two.forms.length === 0);
    assert.ok(one.peak <= 2 && two.peak <= 2); assert.equal(one.active + two.active, 0);
    await second.run(); await one.tick(60000);
    assert.equal(one.forms.length + two.forms.length, count);
  } finally { first.dispose(); second.dispose(); }
});

test('已知红包临近开抢时不先查询列表，领取后马上发现并处理下一红包', async () => {
  let lists = 0;
  const env = session({ list: () => {
    lists++;
    return lists === 1 ? [{ ...bag, waitSec: 62 }] : [{ ...bag, id: '102', waitSec: 2 }];
  } }); const feature = env.start();
  try {
    await flush(); await env.tick(59999); assert.equal(env.forms.length, 0); assert.equal(lists, 1);
    await env.tick(1);
    assert.equal(env.forms[0].at, startTime + 60000); assert.equal(env.forms[0].data.id, '101');
    assert.equal(env.forms[1].data.id, '102'); assert.equal(feature.value.received, 2);
    assert.equal(lists, 3);
  } finally { feature.dispose(); }
});
