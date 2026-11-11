const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const file = path.join(__dirname, '../src/features/playback/violation.ts');
const source = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(source, { exports: exportsObject }, { filename: file });
const { parseViolation } = exportsObject;

test('真实整改通知保留原因并读取本次扣分', () => {
  const content = '直播内容已涉嫌违规，违规原因:直播其他直播平台；请您迅速进行整改，在整改期间，您的直播内容（包括图像和声音）都将被屏蔽，整改通过后直播间将正常播放；本次违规扣除1分。';
  const value = parseViolation(content);
  assert.equal(value.reason, '直播其他直播平台');
  assert.equal(value.deduction, 1);
});

test('官方通用提示未提供原因和扣分，不能记为零分', () => {
  const content = '直播内容已经涉嫌违规，请您迅速进行整改，在整改期间，您的直播内容（包括图像和声音）都将被屏蔽。整改通过后直播间将正常播放。如果未做出整改，我们将会关闭您的直播间并扣除一定主播积分，详情请查看私信!!';
  const value = parseViolation(content);
  assert.equal(value.reason, null);
  assert.equal(value.deduction, null);
});

test('明确零分与未提供扣分区分，时长数字不作为扣分', () => {
  assert.equal(parseViolation('本次违规扣除0分。').deduction, 0);
  assert.equal(parseViolation('本次未扣分。').deduction, 0);
  assert.equal(parseViolation('直播间封禁12小时。').deduction, null);
});
