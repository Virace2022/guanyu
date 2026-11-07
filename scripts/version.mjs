import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 校验供 npm 与用户脚本共用的日期版本。
 * @param {string} value
 */
export function parseVersion(value) {
  const match = /^([1-9]\d{3})\.([1-9]\d{2,3})\.([1-9]\d*)$/.exec(value);
  if (!match) throw new Error(`版本须为 YYYY.<月日整数>.N：${value}`);
  const [, , stampText, sequenceText] = match;
  const year = Number(match[1]);
  const stamp = Number(stampText);
  const month = Math.floor(stamp / 100);
  const day = stamp % 100;
  const sequence = Number(sequenceText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day
    || !Number.isSafeInteger(sequence)) {
    throw new Error(`版本包含无效日期或序号：${value}`);
  }
  return { version: value, year, stamp, sequence };
}

/** 仅在准备新版本时递增，普通构建重复使用已保存版本。
 * @param {string} previous
 * @param {Date} [now]
 */
export function nextVersion(previous, now = new Date()) {
  const old = parseVersion(previous);
  const [year, month, day] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).split('-').map(Number);
  const stamp = month * 100 + day;
  if (year < old.year || year === old.year && stamp < old.stamp) {
    throw new Error('当前北京时间早于已保存版本，不能生成倒退版本');
  }
  const sequence = year === old.year && stamp === old.stamp ? old.sequence + 1 : 1;
  return parseVersion(`${year}.${stamp}.${sequence}`).version;
}

/** @param {string} version @param {string | undefined} tag */
export function checkTag(version, tag) {
  parseVersion(version);
  if (tag !== `v${version}`) throw new Error(`发布 tag 须为 v${version}，实际为 ${tag ?? '未设置'}`);
}

if (process.argv[1] && relative(fileURLToPath(import.meta.url), resolve(process.argv[1])) === '') {
  const file = new URL('../version.json', import.meta.url);
  const state = JSON.parse(await readFile(file, 'utf8'));
  if (process.argv[2] === '--check-tag') {
    checkTag(state.version, process.env.GITHUB_REF_NAME);
    console.info(`[观鱼] 发布版本确认：v${state.version}`);
  } else if (process.argv.length === 2) {
    const version = nextVersion(state.version);
    await writeFile(file, `${JSON.stringify({ version }, null, 2)}\n`);
    console.info(`[观鱼] 下一版：${version}；构建并确认后再创建 v${version} tag`);
  } else {
    throw new Error('使用 npm run version:next 或 npm run release:check');
  }
}
