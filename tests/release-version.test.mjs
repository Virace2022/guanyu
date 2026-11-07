import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTag, nextVersion, parseVersion } from '../scripts/version.mjs';

test('已确认的日期版本可用于 npm，月日整数不保留前导零', () => {
  assert.equal(parseVersion('2026.1108.3').version, '2026.1108.3');
  assert.equal(parseVersion('2026.108.1').version, '2026.108.1');
  assert.equal(parseVersion('2028.229.1').version, '2028.229.1');
});

test('同日准备新版本递增序号，跨日和跨年从 1 开始', () => {
  assert.equal(nextVersion('2026.1108.3', new Date('2026-11-08T04:00:00Z')), '2026.1108.4');
  assert.equal(nextVersion('2026.1108.3', new Date('2026-11-08T16:00:00Z')), '2026.1109.1');
  assert.equal(nextVersion('2026.1231.8', new Date('2026-12-31T16:00:00Z')), '2027.101.1');
});

test('拒绝旧四段格式、前导零、非公历日期与无效序号', () => {
  for (const value of ['2026.11.08.3', '2026.0108.1', '2026.229.1', '2026.431.1',
    '2026.1301.1', '2026.1108.0', '2026.1108.01', '2026.1108.9007199254740992']) {
    assert.throws(() => parseVersion(value));
  }
});

test('准备版本不能使已保存的日期倒退', () => {
  assert.throws(() => nextVersion('2026.1109.1', new Date('2026-11-08T00:00:00Z')));
});

test('发布 tag 必须与唯一版本来源一致', () => {
  assert.doesNotThrow(() => checkTag('2026.1108.3', 'v2026.1108.3'));
  assert.throws(() => checkTag('2026.1108.3', 'v2026.1108.4'));
  assert.throws(() => checkTag('2026.1108.3', undefined));
});
