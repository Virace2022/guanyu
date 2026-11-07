const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, console, ...globals, require(name) {
    if (name in imports) return imports[name];
    throw new Error(`未支持模块 ${name}`);
  } }, { filename: file });
  return exports;
}
const core = load('src/core/state.ts');
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }

async function session(donate = async () => {}) {
  let uid = 'first';
  const donations = [], storage = new Map();
  const settings = core.createState({ backpack: { details: false, badgeDays: false, pocket: false, vipExpiry: false, monthCost: false, glow: true, glowCount: 1 } });
  const player = core.createState({ roomId: '99' });
  const { createBackpack } = load('src/features/backpack/controller.ts', {
    '../../core/state': core,
    '../../adapters/douyu/task-request': { accountId: () => uid, taskDay: () => '2026-11-06' },
    '../../adapters/douyu/backpack-page': { mountBackpackPage: () => ({ apply() {}, update() {}, dispose() {} }) },
    '../../adapters/douyu/rooms': { RoomApi: class { async info() { return []; } close() {} } },
    '../../adapters/douyu/backpack-api': { BackpackApi: class {
      async bag() { return [{ id: 2358, name: '钻粉荧光棒', count: 12 }]; }
      async badges() { return [{ id: '1', name: '甲' }, { id: '2', name: '乙' }]; }
      async donate(gift, count, room) { donations.push({ gift, count, room }); return donate(room); }
      close() {}
    } },
  }, {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval: () => 0, clearInterval() {},
    setTimeout: callback => { queueMicrotask(callback); return 0; },
    document: { hidden: false },
  });
  const backpack = createBackpack(settings, player, () => {}, () => {});
  await flush();
  await backpack.prepare(2);
  return { backpack, donations, settings, changeAccount() { uid = 'second'; player.set({ roomId: '100' }); } };
}

test('数量修改更新已展示的计划，0 根按库存平均分配', async () => {
  const { backpack } = await session();
  assert.equal(backpack.value.plan.total, 4);
  backpack.setGlowCount(0);
  assert.equal(backpack.value.plan.each, 6);
  assert.equal(backpack.value.plan.total, 12);
  assert.equal(backpack.value.glowError, '');
  backpack.dispose();
});

test('成功响应后记录已送数量，后续失败保留记录且允许再次手动赠送', async () => {
  let finishFirst;
  const first = new Promise(resolve => { finishFirst = resolve; });
  const { backpack, donations } = await session(async room => {
    if (room === '1') return first;
    throw new Error('赠送失败');
  });
  const sending = backpack.send();
  await flush();
  assert.equal(backpack.value.deliveries['1'].status, 'sending');
  assert.equal(backpack.value.deliveries['2'], undefined);
  finishFirst();
  await sending;
  assert.equal(backpack.value.deliveries['1'].status, 'sent');
  assert.equal(backpack.value.deliveries['2'].status, 'failed');
  assert.ok(backpack.value.plan);
  assert.match(backpack.value.sendError, /已停止后续赠送/);
  assert.equal(backpack.value.sent['1'], 2);
  await backpack.send();
  assert.equal(donations.length, 4);
  assert.equal(backpack.value.sent['1'], 4);
  backpack.setGlowCount(3);
  assert.equal(backpack.value.plan.each, 3);
  assert.equal(backpack.value.sent['1'], 4);
  await backpack.send();
  assert.equal(donations.length, 6);
  assert.equal(backpack.value.sent['1'], 7);
  backpack.dispose();
});

test('修改背包显示设置不打断赠送，新计划和再次赠送均保留已送记录', async () => {
  let finishSecond;
  const second = new Promise(resolve => { finishSecond = resolve; });
  const { backpack, donations, settings } = await session(room => room === '2' ? second : undefined);
  const sending = backpack.send();
  await flush();
  assert.equal(backpack.value.sent['1'], 2);
  assert.equal(backpack.value.deliveries['2'].status, 'sending');
  settings.set({ backpack: { ...settings.value.backpack, details: true } });
  assert.equal(backpack.value.sending, true);
  assert.equal(backpack.value.sent['1'], 2);
  assert.equal(backpack.value.deliveries['2'].status, 'sending');
  finishSecond();
  await sending;
  assert.equal(backpack.value.sent['2'], 2);
  await backpack.prepare(1);
  assert.equal(backpack.value.sent['1'], 2);
  assert.equal(backpack.value.sent['2'], 2);
  await backpack.send();
  assert.equal(donations.length, 4);
  assert.equal(backpack.value.sent['1'], 3);
  assert.equal(backpack.value.sent['2'], 3);
  backpack.dispose();
});

test('账号变化后，迟到的赠送响应不写入新账号头像状态', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { backpack, changeAccount, donations } = await session(() => pending);
  const sending = backpack.send();
  await flush();
  changeAccount();
  finish();
  await sending;
  assert.equal(backpack.value.plan, null);
  assert.equal(Object.keys(backpack.value.deliveries).length, 0);
  assert.equal(Object.keys(backpack.value.sent).length, 0);
  assert.equal(donations.length, 1);
  backpack.dispose();
});
