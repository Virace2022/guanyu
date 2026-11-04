import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = new URL('../', import.meta.url);
const versionFile = new URL('version.json', root);
const previous = JSON.parse(await readFile(versionFile, 'utf8'));
const date = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date()).replaceAll('-', '.');
const sequence = previous.version.startsWith(`${date}.`)
  ? Number(previous.version.slice(date.length + 1)) + 1
  : 1;
const version = `${date}.${sequence}`;

process.env.GUANYU_BUILD_VERSION = version;
await build({ root: fileURLToPath(root) });
const output = await readFile(new URL('dist/douyu.guanyu.js', root), 'utf8');
const license = (await readFile(new URL('LICENSE', root), 'utf8')).trim();
const svelteCopyright = (await readFile(new URL('node_modules/svelte/LICENSE.md', root), 'utf8')).split(/\r?\n/)[0];
if (!output.includes(license) || !output.includes(svelteCopyright)) {
  throw new Error('生产产物缺少必要许可或作者声明');
}
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('dist/douyu.guanyu.js', root))], {
  stdio: 'inherit',
});
await writeFile(versionFile, `${JSON.stringify({ version }, null, 2)}\n`);
console.info(`[观鱼] 生产构建完成：${version}`);
