const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, URLSearchParams, require(name) {
    if (name in imports) return imports[name]; throw new Error(`未支持模块 ${name}`);
  } }, { filename: file });
  return exports;
}

const { createClientSignApi } = load('src/adapters/douyu/client-sign.ts', {
  './task-request': {
    accountToken: () => 'test-account', cookie: () => 'test-device',
    assertResponse(result) { if (Number(result.error)) throw new Error(result.msg); },
    confirmedResult(result) { if (Number(result.error)) throw new Error(result.msg); return 'signed'; },
  },
});
const { runClientSign, clientSignDetail } = load('src/features/sign/client.ts');
const day = '2026-11-10';
const signed = { signedOn: day, days: 7, totalDays: 2230 };
const missing = { signedOn: day, days: 1, missedDays: 5, remaining: 5,
  calendar: [{ date: '11.04', signed: true }, ...['11.05', '11.06', '11.07', '11.08', '11.09'].map(date => ({ date, signed: false })), { date: '11.10', signed: true }] };
const current = () => {};

test('按 2026-11-10 官方 H5 真实响应读取连续天数，不能使用今日签到标志 sign_cnt', async () => {
  const api = createClientSignApi({ async request(url) { return { error: '0', data: url.endsWith('getRemedySign') ? {
    sign_omit_days: 0, sign_remedy_cnt: 1, sign_running_days: 7, sign_today: day,
    sign_schedule_list: ['11.04', '11.05', '11.06', '11.07', '11.08', '11.09', '11.10'].map(ds => ({ ds, sf: 1 })),
  } : { sign_cnt: '1', sign_rd: '7', sign_sum: '2230', sign_today: day } }; } });
  assert.equal(JSON.stringify(await api.status()), JSON.stringify(signed));
  const remedy = await api.remedyStatus();
  assert.equal(remedy.days, 7); assert.equal(remedy.remaining, 1); assert.equal(remedy.missedDays, 0);
  assert.ok(remedy.calendar.every(item => item.signed));
});

test('缺少官方连续天数字段时报告异常，不把今日签到标志当成替代值', async () => {
  const api = createClientSignApi({ async request() { return { error: 0, data: { sign_cnt: '1', sign_sum: '2230', sign_today: day } }; } });
  await assert.rejects(api.status(), /sign_rd/);
});

test('首次签到确认后不消耗补签机会', async () => {
  let submitted = false, result;
  await runClientSign({
    async status() { return submitted ? { signedOn: day, days: 1, totalDays: 1 } : { signedOn: '', days: 0, totalDays: 0 }; },
    async sign() { submitted = true; return { rewards: '' }; },
    async remedyStatus() { return missing; }, remedy() { assert.fail('首次签到不得补签'); },
  }, day, () => true, current, value => { result = value; });
  assert.equal(result.days, 1); assert.equal(result.remedyChecked, true);
  assert.equal(result.remaining, 5);
});

test('关闭自动补签时仍显示官方剩余次数，不重复签到或提交补签', async () => {
  let result;
  await runClientSign({ async status() { return signed; }, sign() { assert.fail('不能重复签到'); },
    async remedyStatus() { return { ...missing, missedDays: 0, remaining: 1 }; }, remedy() { assert.fail('补签开关关闭'); },
  }, day, () => false, current, value => { result = value; });
  assert.equal(result.days, 7); assert.equal(result.remedyChecked, false);
  assert.equal(result.remaining, 1);
  assert.match(clientSignDetail(result), /连续签到第 7 天.*累计签到 2230 天.*剩余补签 1 次.*2026-11-10/);
});

test('已有历史且漏五天时按官方一键操作，只提交一次，重读日历与连续天数', async () => {
  let submits = 0, result;
  await runClientSign({
    async status() { return submits ? signed : { ...signed, days: 1 }; },
    async remedyStatus() { return submits ? { ...missing, missedDays: 0, remaining: 4, days: 7, calendar: missing.calendar.map(item => ({ ...item, signed: true })) } : missing; },
    async remedy() { submits++; },
  }, day, () => true, current, value => { result = value; });
  assert.equal(submits, 1); assert.equal(result.days, 7); assert.equal(result.remedyChecked, true);
  assert.equal(result.remaining, 4);
  assert.match(result.remedy, /5 天漏签/);
});

test('没有漏签或资格耗尽时不提交补签', async () => {
  for (const state of [{ ...missing, missedDays: 0 }, { ...missing, remaining: 0 }]) {
    let result;
    await runClientSign({ async status() { return signed; }, async remedyStatus() { return state; },
      remedy() { assert.fail('当前不应提交补签'); },
    }, day, () => true, current, value => { result = value; });
    assert.equal(result.remedyChecked, true);
    assert.equal(result.remaining, state.remaining);
  }
});

test('查询补签资格期间关闭开关，随后不提交', async () => {
  let enabled = true;
  await runClientSign({ async status() { return signed; }, async remedyStatus() { enabled = false; return missing; },
    remedy() { assert.fail('已关闭自动补签'); },
  }, day, () => enabled, current, () => {});
});

test('接口说成功但日历未补齐时不确认完成，并保留今日已签状态', async () => {
  let result;
  await assert.rejects(runClientSign({ async status() { return signed; }, async remedyStatus() { return missing; }, async remedy() {},
  }, day, () => true, current, value => { result = value; }), /尚未确认漏签日期/);
  assert.equal(result.signedOn, day); assert.equal(result.remedyChecked, false);
});
