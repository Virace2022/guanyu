const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, overrides = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, structuredClone, TextEncoder, TextDecoder, btoa, atob, require(name) {
    if (name in overrides) return overrides[name];
    return load(path.resolve(path.dirname(file), `${name}.ts`), overrides, cache);
  } }, { filename: file });
  return exports;
}

const { createSettings, settingsKey } = load(path.join(__dirname, '../src/config/settings.ts'));

function session() {
  const values = new Map();
  const events = new EventTarget();
  let fail = false;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (fail) throw new Error('空间不足'); values.set(key, value); },
  };
  const settings = createSettings(storage, events);
  const draft = () => ({ theme: 'dark', accentColor: '#aa3344',
    optimization: { ...settings.value.optimization, hideAds: false },
    barrage: { ...settings.value.barrage }, nativeShield: { ...settings.value.nativeShield },
    team: { showToolbar: false, columns: 2, teamColumns: 1, alignment: 'left', originalWidth: true },
  });
  return { settings, storage, events, draft, fail() { fail = true; } };
}

test('主题和页面整理立即预览，放弃时恢复且未写入存储', () => {
  const { settings, storage, draft } = session();
  settings.preview(draft());
  assert.equal(settings.runtime.value.theme, 'dark');
  assert.equal(settings.runtime.value.optimization.hideAds, false);
  assert.equal(settings.runtime.value.team.showToolbar, false);
  assert.equal(settings.value.theme, 'page');
  assert.equal(storage.getItem(settingsKey), null);
  settings.preview(null);
  assert.equal(settings.runtime.value.theme, 'page');
  assert.equal(settings.runtime.value.optimization.hideAds, true);
  assert.equal(settings.runtime.value.team.showToolbar, true);
  settings.dispose();
});

test('保存保留新设置，重新打开仍读取已保存选择', () => {
  const { settings, storage, events, draft } = session();
  const next = { ...settings.value, ...draft(), team: { ...settings.value.team, ...draft().team } };
  settings.preview(draft());
  settings.save(next);
  settings.preview(null);
  const reopened = createSettings(storage, events);
  assert.equal(reopened.value.theme, 'dark');
  assert.equal(reopened.value.optimization.hideAds, false);
  assert.equal(reopened.value.team.showToolbar, false);
  assert.equal(settings.runtime.value.theme, 'dark');
  settings.dispose(); reopened.dispose();
});

test('写入失败保留预览和保存前设置', () => {
  const { settings, storage, draft, fail } = session();
  settings.preview(draft()); fail();
  assert.throws(() => settings.save({ ...settings.value, theme: 'dark' }), /空间不足/);
  assert.equal(storage.getItem(settingsKey), null);
  assert.equal(settings.value.theme, 'page');
  assert.equal(settings.runtime.value.theme, 'dark');
  settings.preview(null);
  assert.equal(settings.runtime.value.theme, 'page');
  settings.dispose();
});

test('跨页更新后放弃草稿恢复最新保存值', () => {
  const { settings, storage, events, draft } = session();
  settings.preview(draft());
  storage.setItem(settingsKey, JSON.stringify({ ...settings.value, theme: 'light', accentColor: '#2255aa' }));
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: settingsKey });
  events.dispatchEvent(event);
  settings.preview(null);
  assert.equal(settings.runtime.value.theme, 'light');
  assert.equal(settings.runtime.value.accentColor, '#2255aa');
  settings.dispose();
});

test('49 个预览不确认，50 个及以上确认，取消不启动', async () => {
  for (const count of [49, 50, 51]) {
    for (const accept of [true, false]) {
      let prompts = 0, opened = false;
      const { toggleTeamPreview } = load(path.join(__dirname, '../src/ui/team-preview.ts'), {
        './confirm': { async confirmAction() { prompts++; return accept; } },
      });
      const team = {
        value: { source: { activity: 'real-activity', rooms: [{ id: '123' }] }, layout: {}, grouped: false, preview: false, previewMembers: false },
        previewCount: () => count,
        setPreview: enabled => { opened = enabled; },
      };
      await toggleTeamPreview(team, 'main', () => {});
      assert.equal(prompts, count < 50 ? 0 : 1);
      assert.equal(opened, count < 50 || accept);
    }
  }
});

const teamLayout = load(path.join(__dirname, '../src/features/team-live/layout.ts'));

test('空队伍可保存但不占页面分组，列数跟随实际队伍数', () => {
  const layout = { peopleTitle: '团长', people: [], teams: [
    { id: 'one', name: '队伍 1', captains: [], members: ['12906996'] },
    { id: 'two', name: '队伍 2', captains: [], members: ['7204164'] },
    { id: 'empty', name: '队伍 3', captains: [], members: [] },
  ] };
  const saved = teamLayout.validateLayout(layout);
  assert.equal(saved.teams.length, 3);
  assert.deepEqual(Array.from(teamLayout.visibleTeams(saved), team => team.name), ['队伍 1', '队伍 2']);
  assert.equal(teamLayout.teamColumns(2, 1400, 4), 2);
  assert.equal(teamLayout.teamColumns(3, 1400, 4), 3);
  assert.equal(teamLayout.teamColumns(2, 1400), 2);
  assert.equal(teamLayout.teamColumns(3, 500), 2);
});

test('自定义嘉宾随名单分享保留，活动本身的成员集合不改变', () => {
  const layout = { peopleTitle: '团长', people: [
    { id: 'guest', roomId: '71415', name: '嘉宾', label: '特邀嘉宾' },
  ], teams: [], customRooms: [
    { id: '71415', name: '嘉宾', avatar: 'https://apic.douyucdn.cn/guest.jpg', live: false },
  ] };
  const code = teamLayout.exportLayout(layout, 'page-59174', ['12906996', '7204164']);
  const imported = teamLayout.importLayout(code, 'page-59174', ['12906996', '7204164']);
  assert.deepEqual(imported.customRooms, layout.customRooms);
  assert.equal(imported.people[0].label, '特邀嘉宾');
  const rooms = teamLayout.layoutRooms(imported, [{ id: '12906996', name: '优优or', avatar: '', live: false }]);
  assert.deepEqual(Array.from(rooms, room => room.id), ['12906996', '71415']);
  const officialGuest = { id: '71415', name: '官方最新昵称', avatar: '', live: true };
  const refreshed = teamLayout.layoutRooms(imported, [officialGuest]);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].name, '官方最新昵称');
});
