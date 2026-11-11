const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, globals = {}, imports = {}) {
  const exports = {};
  let account;
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, AbortController, setTimeout, clearTimeout,
    document: { cookie: 'acf_uid=test-account; acf_biz=1; acf_stk=test-stk; acf_ct=0; acf_ltkid=test-ltk; acf_ccn=test-ctn; cvl_csrf_token=test-csrf' },
    require(name) { if (name in imports) return imports[name]; if (name === './account') return account ||= load('src/adapters/douyu/account.ts', globals, { $: imports.$ || {} }); if (name === '../../core/diagnostics') return load('src/core/diagnostics.ts'); throw new Error(`未支持模块 ${name}`); }, ...globals,
  }, { filename: file });
  return exports;
}

const requestHelpers = load('src/adapters/douyu/task-request.ts', {}, { $: {} });
const { createDouyuTasks } = load('src/adapters/douyu/tasks.ts', {}, { './task-request': requestHelpers });
const { checkPoints } = load('src/features/sign/points.ts');
const { runFanChat } = load('src/features/sign/fan-chat.ts', {}, { '../../adapters/douyu/task-request': requestHelpers });
const { createClientSignApi } = load('src/adapters/douyu/client-sign.ts', {}, { './task-request': requestHelpers });
const clientSign = load('src/features/sign/client.ts');
const signed = value => ({ error: 0, data: { todaySigned: value, todayTaskFinished: 1 } });
const view = tasks => ({ error: 0, data: { startTime: 1793894400, taskList: tasks } });

test('粉丝家园 error=-1 且明确今日已签到时，确认完成而不重试', async () => {
  const api = createDouyuTasks({ async request() { return { error: -1, msg: '今日已签到，请明天再来' }; } });
  assert.equal(await api.signFansHome('71415'), 'already');
});

test('粉丝家园真正失败仍保留错误，不误报今日完成', async () => {
  const api = createDouyuTasks({ async request() { return { error: -1, msg: '签到失败，请稍后重试' }; } });
  await assert.rejects(api.signFansHome('71415'), /签到失败.*error=-1/);
});

async function restoreFansHome(error) {
  const day = '2026-11-06', nextAt = Date.now() + 300000;
  const targets = Array.from({ length: 15 }, (_, index) => ({ id: String(index + 1), name: index === 14 ? 'CSTG' : `房间${index + 1}`, live: false }));
  const lane = { id: 'fansHome', label: '粉丝家园签到', status: 'error', attempts: 4, nextAt,
    detail: `14 / 15 个房间已确认，继续按间隔处理；CSTG：${error}`,
    targets, results: Object.fromEntries(targets.slice(0, 14).map(room => [room.id, 'signed'])),
    failures: { 15: { attempts: 4, nextAt, error } } };
  const key = 'guanyu:daily-tasks:v1:test-account';
  const values = new Map([[key, JSON.stringify({ day, lanes: { fansHome: lane }, readIds: [], tasks: [] })]]);
  const requests = [];
  let scheduled;
  const core = load('src/core/state.ts');
  const { createDailyTasks } = load('src/features/sign/daily.ts', {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    navigator: { onLine: true, locks: { request: async (_key, _options, run) => run({}) } },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: callback => { scheduled = callback; return 0; }, clearTimeout() {},
  }, {
    '../../core/state': core,
    '../../config/sign': load('src/config/sign.ts'),
    '../../adapters/douyu/task-request': { ...requestHelpers, taskDay: () => day,
      createTaskRequest: () => ({ async request(url) { requests.push(url); throw new Error('本场景不应重新请求签到'); }, dispose() {} }) },
    '../../adapters/douyu/tasks': { createDouyuTasks },
    '../../adapters/douyu/client-sign': { createClientSignApi }, './client': clientSign,
    './points': { checkPoints },
    './fan-chat': { runFanChat },
    '../../adapters/douyu/chat-session': { rememberChatRuntime() {}, createChatSessions: () => ({ cancel() {}, dispose() {}, send() { assert.fail('粉丝家园恢复不应发送弹幕'); } }) },
  });
  const daily = createDailyTasks(core.createState({ sign: { enabled: true, fansHome: true } }), () => '71415',
    { claim: async () => true, room: () => '71415', take: () => false });
  await new Promise(resolve => setImmediate(resolve));
  return { daily, requests, saved: () => JSON.parse(values.get(key)).lanes.fansHome,
    async tick() { scheduled(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('当天历史 14/15 已签到错误恢复为 15/15，并保存完成状态且不重复请求', async () => {
  const { daily, requests, saved, tick } = await restoreFansHome('今日已签到，请明天再来（error=-1）');
  try {
    const row = daily.value.rows.find(row => row.id === 'fansHome');
    assert.equal(row.status, 'done');
    assert.equal(row.detail, '15 / 15 个房间已确认');
    assert.equal(row.nextAt, 0);
    assert.equal(row.attempts, 0);
    assert.equal(saved().results['15'], 'already');
    assert.deepEqual(saved().failures, {});
    await tick();
    assert.deepEqual(requests, []);
    assert.equal(daily.value.rows.find(row => row.id === 'fansHome').status, 'done');
  } finally { daily.dispose(); }
});

test('历史真正失败仍显示 14/15 并保留重试记录', async () => {
  const message = '签到失败，请稍后重试（error=-1）';
  const { daily, requests, saved } = await restoreFansHome(message);
  try {
    const row = daily.value.rows.find(row => row.id === 'fansHome');
    assert.equal(row.status, 'error');
    assert.match(row.detail, /^14 \/ 15 个房间已确认/);
    assert.equal(saved().results['15'], undefined);
    assert.equal(saved().failures['15'].error, message);
    assert.deepEqual(requests, []);
  } finally { daily.dispose(); }
});

test('任务中心签到沿用官方验证参数，31200 成功后仍核对今日状态', async () => {
  const calls = [];
  let reads = 0;
  const api = createDouyuTasks({ async request(url, options = {}) {
    calls.push({ url, options });
    if (url.includes('getStatus')) return signed(reads++ ? 1 : 0);
    return { error: 31200, msg: '签到成功无礼包' };
  } });
  assert.equal(await api.pointsSign(), 'signed');
  const claim = calls.find(call => call.url.endsWith('/doSign'));
  const data = new URLSearchParams(claim.options.data);
  assert.equal(data.get('useJiYan'), 'true');
  assert.equal(data.get('csrfToken'), 'test-csrf');
  assert.ok(calls.every(call => call.options.sameOrigin));
  assert.equal(reads, 2);
});

test('签到返回截图中的 9001 时，仍处理可领取的观时积分并保留失败原因', async () => {
  let checked = false;
  const result = await checkPoints({
    async pointsSign() { throw new Error('请求校验不通过（error=9001）'); },
    async viewRewards() { checked = true; return 5; },
  }, () => {});
  assert.equal(checked, true);
  assert.equal(result.failed, true);
  assert.equal(result.signed, false);
  assert.match(result.detail, /已确认领取 5 档观时积分/);
  assert.match(result.detail, /error=9001/);
});

test('观时积分只领取官方状态 2，随后核对状态 3', async () => {
  const claimed = [];
  let reads = 0;
  const api = createDouyuTasks({ async request(url, options) {
    assert.equal(options.sameOrigin, true);
    if (url.endsWith('/viewStatus')) return view({ 1: { status: reads++ ? 3 : 2 }, 2: { status: 3 }, 3: { status: 1 } });
    const data = new URLSearchParams(options.data);
    assert.equal(data.get('startTime'), '1793894400');
    claimed.push(data.get('id'));
    return { error: 0, data: {} };
  } });
  assert.equal(await api.viewRewards(), 1);
  assert.deepEqual(claimed, ['1']);
  assert.equal(reads, 2);
});

test('领取接口返回成功但官方状态仍为可领取时，不记作已确认领取', async () => {
  const api = createDouyuTasks({ async request(url) {
    return url.endsWith('/viewStatus') ? view({ 1: { status: 2 } }) : { error: 0, data: {} };
  } });
  await assert.rejects(api.viewRewards(), /官方尚未确认/);
});

test('任务中心请求使用携带浏览器 Cookie 的同源 fetch', async () => {
  let requested = false;
  const values = new Map();
  const { createTaskRequest } = load('src/adapters/douyu/task-request.ts', {
    navigator: { locks: { request: async (_name, _options, run) => run({}) } },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    async fetch(url, options) {
      requested = true;
      assert.equal(url, 'https://www.douyu.com/wgapi/activitync/gametask/viewStatus');
      assert.equal(options.credentials, 'include');
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'POST');
      assert.equal(options.body, 'actAlias=20250521OPFOY');
      return { status: 200, text: async () => JSON.stringify(view({ 1: { status: 2 } })) };
    },
  }, { $: { GM_xmlhttpRequest() { assert.fail('任务中心请求不应经过 GM 跨源桥接'); } } });
  const http = createTaskRequest();
  const response = await http.request('/wgapi/activitync/gametask/viewStatus', { method: 'POST', sameOrigin: true, data: 'actAlias=20250521OPFOY' });
  assert.equal(requested, true);
  assert.equal(response.data.taskList[1].status, 2);
  http.dispose();
});

test('UID 已存在但官方聊天尚未确认当前账号时，等待登录完成', () => {
  const page = { location: { pathname: '/80432' }, socketProxy: { info: {
    user: { userId: 'test-account' }, barrage: { isUserLogied: false },
  } } };
  const account = load('src/adapters/douyu/account.ts', {}, { $: { unsafeWindow: page } });
  assert.equal(account.accountId(), 'test-account');
  assert.equal(account.accountReady(), false);
  page.socketProxy.info.barrage.isUserLogied = true;
  assert.equal(account.accountReady(), true);
  page.socketProxy.info.user.userId = 'another-account';
  assert.equal(account.accountReady(), false);
});

test('只有 UID 而缺少完整登录凭据时，个人中心也不能启动账号请求', () => {
  const account = load('src/adapters/douyu/account.ts', { document: { cookie: 'acf_uid=test-account' } }, { $: {} });
  assert.equal(account.accountId(), 'test-account');
  assert.equal(account.accountReady(), false);
});

test('实测请登录响应暂停当前凭据，普通业务失败和旧凭据的迟到响应不暂停新登录', () => {
  const doc = { cookie: 'acf_uid=test-account; acf_biz=1; acf_stk=first; acf_ct=0; acf_ltkid=test-ltk' };
  const account = load('src/adapters/douyu/account.ts', { document: doc }, { $: {} });
  const previous = account.accountToken();
  account.observeAccountResponse({ error: 1, msg: '任务尚未完成' }, previous);
  assert.equal(account.accountReady(), true);
  account.observeAccountResponse({ error: 9, msg: '请登录' }, previous);
  assert.equal(account.accountReady(), false);
  doc.cookie = doc.cookie.replace('acf_stk=first', 'acf_stk=second');
  assert.equal(account.accountReady(), true);
  account.observeAccountResponse({ error: 1002, msg: '用户未登录' }, previous);
  assert.equal(account.accountReady(), true);
});

for (const recovery of ['凭据变化', '手动检查']) test(`后台任务就绪前和鉴权失败后不发送请求，${recovery}后可以继续`, async () => {
  const doc = { cookie: 'acf_uid=test-account; acf_biz=1; acf_stk=first; acf_ct=0; acf_ltkid=test-ltk' };
  const page = { location: { pathname: '/80432' }, socketProxy: { info: {
    user: { userId: 'test-account' }, barrage: { isUserLogied: false },
  } } };
  const values = new Map();
  let requests = 0;
  const helpers = load('src/adapters/douyu/task-request.ts', {
    document: doc,
    navigator: { locks: { request: async (_name, _options, run) => run({}) } },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    async fetch() { requests++; return { status: 200, text: async () => JSON.stringify(requests === 1 ? { error: 9, msg: '请登录' } : { error: 0 }) }; },
  }, { $: { unsafeWindow: page, GM_xmlhttpRequest() { assert.fail('本场景不能发起 GM 请求'); } } });
  const http = helpers.createTaskRequest();
  try {
    await assert.rejects(http.request('/japi/prop/backpack/web/v5', { sameOrigin: true }), /等待斗鱼登录就绪/);
    assert.equal(requests, 0);
    page.socketProxy.info.barrage.isUserLogied = true;
    assert.equal((await http.request('/japi/prop/backpack/web/v5', { sameOrigin: true })).error, 9);
    await assert.rejects(http.request('/japi/prop/backpack/web/v5', { sameOrigin: true }), /等待斗鱼登录就绪/);
    assert.equal(requests, 1);
    if (recovery === '凭据变化') doc.cookie = doc.cookie.replace('acf_stk=first', 'acf_stk=second');
    else helpers.retryAccount();
    assert.equal(requests, 1);
    values.clear();
    assert.equal((await http.request('/japi/prop/backpack/web/v5', { sameOrigin: true })).error, 0);
    assert.equal(requests, 2);
  } finally { http.dispose(); }
});

test('粉丝牌后台 HTML 请求使用拒绝重定向的同源 fetch，不跟随 GM 登录链路', async () => {
  const helpers = load('src/adapters/douyu/task-request.ts', {
    navigator: { locks: { request: async (_name, _options, run) => run({}) } },
    localStorage: { getItem: () => null, setItem() {} },
    async fetch(url, options) {
      assert.equal(url, 'https://www.douyu.com/member/cp/getFansBadgeList');
      assert.equal(options.credentials, 'include');
      assert.equal(options.redirect, 'error');
      return { status: 200, text: async () => '<table class="fans-badge-list"></table>' };
    },
  }, { $: { GM_xmlhttpRequest() { assert.fail('个人中心资料不应走自动跟随跳转的 GM 请求'); } } });
  const http = helpers.createTaskRequest();
  try { assert.match(await http.request('/member/cp/getFansBadgeList', { text: true }), /fans-badge-list/); }
  finally { http.dispose(); }
});

// 字段与 0/1、1/1 计数来自真实 userTaskList；不以此模拟官方鉴权或网络兼容。
test('粉丝牌任务读取官方每日弹幕计数，不将周任务当作每日完成', async () => {
  const responses = [0, 1];
  const api = createDouyuTasks({ async request(url, options) {
    assert.ok(url.includes('/fans/userTaskList?rid=80432&uid=test-account'));
    assert.equal(options.sameOrigin, true);
    return { error: 0, data: { dayTasks: [{ taskId: 66379, taskType: 1, taskTotal: 1, taskNum: responses.shift() }],
      weekTasks: [{ taskType: 1, taskTotal: 4, taskNum: 4 }] } };
  } });
  assert.equal((await api.fanChatTask('80432')).done, false);
  assert.equal((await api.fanChatTask('80432')).done, true);
});

function chatLane(ids) {
  return { id: 'fanChat', label: '粉丝牌弹幕任务', status: 'pending', detail: '', nextAt: 0, attempts: 0,
    targets: ids.map(id => ({ id, name: id, live: false })), results: {}, failures: {} };
}

test('已由其他页面完成的弹幕任务只核对，不重发', async () => {
  const lane = chatLane(['84452', '80432']);
  lane.results['84452'] = 'sent';
  const reads = [];
  await runFanChat(lane, { async fanChatTask(id) { reads.push(id); return { cur: 1, max: 1, done: true }; } },
    { send() { assert.fail('官方已完成时不应发送'); } }, 'test-account', () => {}, () => {});
  assert.deepEqual(reads, ['80432']);
  assert.equal(lane.status, 'done');
  assert.equal(lane.results['80432'], 'already');
});

test('弹幕最多两路运行，逐房落盘后恢复只处理剩余房间', async () => {
  const lane = chatLane(['84452', '74751', '80432']);
  const completed = new Set(), release = new Map(), sent = [];
  let active = 0, peak = 0, saved;
  const api = { async fanChatTask(id) { return { cur: completed.has(id) ? 1 : 0, max: 1, done: completed.has(id) }; } };
  const sessions = { async send(id, text) {
    assert.equal(text, '.');
    sent.push(id); active++; peak = Math.max(peak, active);
    await new Promise(resolve => release.set(id, resolve)); completed.add(id); active--;
  } };
  const running = runFanChat(lane, api, sessions, 'test-account', () => {}, () => { saved = JSON.stringify(lane); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 2); assert.equal(peak, 2); assert.equal(sent.length, 2);
  release.get('84452')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.parse(saved).results['84452'], 'sent');
  assert.equal(JSON.parse(saved).results['74751'], undefined);
  release.get('74751')(); await running;
  const restored = JSON.parse(saved);
  await runFanChat(restored, api, { async send(id) { sent.push(id); completed.add(id); } }, 'test-account', () => {}, () => {});
  assert.deepEqual(sent, ['84452', '74751', '80432']);
  assert.equal(restored.status, 'done');
});

test('发送确认中断后保留重试，恢复先核对已完成进度而不重复发送', async () => {
  const lane = chatLane(['74751']);
  let completed = false, sends = 0;
  const api = { async fanChatTask() { return { cur: completed ? 1 : 0, max: 1, done: completed }; } };
  await runFanChat(lane, api, { async send() { sends++; completed = true; throw new Error('发送确认超时'); } },
    'test-account', () => {}, () => {});
  assert.equal(lane.results['74751'], undefined);
  assert.equal(lane.status, 'error');
  lane.failures['74751'].nextAt = 0;
  await runFanChat(lane, api, { send() { assert.fail('恢复应先确认官方已完成'); } }, 'test-account', () => {}, () => {});
  assert.equal(sends, 1);
  assert.equal(lane.status, 'done');
});

test('官方已接收但任务进度延迟时，恢复只查进度，不发送第二条', async () => {
  const lane = chatLane(['74751']);
  let done = false, sends = 0, saved;
  const api = { async fanChatTask() { return { cur: done ? 1 : 0, max: 1, done }; } };
  await runFanChat(lane, api, { async send(_id, text) { assert.equal(text, '.'); sends++; } },
    'test-account', () => {}, () => { saved = JSON.stringify(lane); });
  assert.equal(lane.status, 'error');
  const restored = JSON.parse(saved);
  assert.equal(restored.submitted['74751'], true);
  const sessions = { send() { assert.fail('已获官方接收回包，不应重发'); } };
  restored.failures['74751'].nextAt = 0;
  await runFanChat(restored, api, sessions, 'test-account', () => {}, () => {});
  assert.equal(restored.status, 'error');
  done = true; restored.failures['74751'].nextAt = 0;
  await runFanChat(restored, api, sessions, 'test-account', () => {}, () => {});
  assert.equal(restored.status, 'done');
  assert.equal(restored.results['74751'], 'sent');
  assert.equal(sends, 1);
});

test('100 个房间当天各发一次，完成后定时、手动、刷新均不查询，北京时间零点才重开', async () => {
  let now = Date.parse('2026-11-08T12:00:00+08:00'), scheduled;
  const values = new Map(), completed = new Set(), sent = [];
  const counts = { badges: 0, tasks: 0 };
  const key = 'guanyu:daily-tasks:v1:test-account';
  const day = () => requestHelpers.taskDay(now);
  const targets = Array.from({ length: 100 }, (_, index) => ({ id: String(index + 1), name: `房间${index + 1}`, live: false }));
  const api = {
    async badges() { counts.badges++; return targets; },
    async fanChatTask(id) { counts.tasks++; const done = completed.has(`${day()}:${id}`); return { cur: done ? 1 : 0, max: 1, done }; },
  };
  const sessions = {
    async send(id, text) { assert.equal(text, '.'); sent.push(`${day()}:${id}`); completed.add(`${day()}:${id}`); },
    cancel() {}, dispose() {},
  };
  const core = load('src/core/state.ts'), config = load('src/config/sign.ts');
  const settings = core.createState({ sign: { ...Object.fromEntries(config.signTasks.map(task => [task.id, false])), enabled: true, fanChat: true } });
  const { createDailyTasks } = load('src/features/sign/daily.ts', {
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) },
    navigator: { onLine: true, locks: { request: async (_name, _options, run) => run({}) } },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: callback => { scheduled = callback; return 0; }, clearTimeout() {},
  }, {
    '../../core/state': core, '../../config/sign': config,
    '../../adapters/douyu/task-request': { ...requestHelpers, taskDay: day,
      createTaskRequest: () => ({ request() { assert.fail('本场景只使用任务 API 边界'); }, dispose() {} }) },
    '../../adapters/douyu/tasks': { createDouyuTasks: () => api },
    '../../adapters/douyu/client-sign': { createClientSignApi }, './client': clientSign,
    '../../adapters/douyu/chat-session': { rememberChatRuntime() {}, createChatSessions: () => sessions },
    './fan-chat': { runFanChat }, './points': { checkPoints },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const start = () => createDailyTasks(settings, () => '', { claim: async () => true, room: () => '', take: () => false, matches: () => false });
  const tick = async () => { scheduled(); await flush(); };
  let daily = start();
  try {
    await flush();
    for (let batch = 1; batch < 50; batch++) await tick();
    assert.equal(sent.length, 100); assert.equal(new Set(sent).size, 100);
    assert.equal(counts.badges, 1); assert.equal(counts.tasks, 200);
    assert.equal(daily.value.rows.find(row => row.id === 'fanChat').status, 'done');
    assert.equal(JSON.parse(values.get(key)).lanes.fanChat.status, 'done');
    const finished = { ...counts };
    await tick(); await daily.run();
    daily.dispose(); daily = start(); await flush();
    now = Date.parse('2026-11-08T23:59:59+08:00'); await tick(); await daily.run();
    assert.deepEqual(counts, finished); assert.equal(sent.length, 100);
    now = Date.parse('2026-11-09T00:00:00+08:00'); await tick();
    assert.equal(daily.value.day, '2026-11-09');
    assert.equal(sent.length, 102); assert.equal(counts.badges, 2); assert.equal(counts.tasks, 204);
    assert.equal(JSON.parse(values.get(key)).day, '2026-11-09');
    assert.equal(Object.keys(JSON.parse(values.get(key)).lanes.fanChat.results).length, 2);
  } finally { daily.dispose(); }
});
