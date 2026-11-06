const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, globals = {}, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, AbortController, setTimeout, clearTimeout,
    document: { cookie: 'acf_uid=test-account; acf_ccn=test-ctn; cvl_csrf_token=test-csrf' },
    require(name) { if (name in imports) return imports[name]; throw new Error(`未支持模块 ${name}`); }, ...globals,
  }, { filename: file });
  return exports;
}

const requestHelpers = load('src/adapters/douyu/task-request.ts', {}, { $: {} });
const { createDouyuTasks } = load('src/adapters/douyu/tasks.ts', {}, { './task-request': requestHelpers });
const { checkPoints } = load('src/features/sign/points.ts');
const signed = value => ({ error: 0, data: { todaySigned: value, todayTaskFinished: 1 } });
const view = tasks => ({ error: 0, data: { startTime: 1793894400, taskList: tasks } });

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
