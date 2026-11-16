import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { transform } from 'esbuild';
import { githubChannel, metaFile, scriptFile, version } from './release-config.mjs';
import { packRelease } from './package.mjs';
import { verifyDistribution } from './distribution.mjs';

const root = new URL('../', import.meta.url);
await build({ root: fileURLToPath(root) });
const bundled = await readFile(new URL(`dist/${scriptFile}`, root), 'utf8');
const metadata = await readFile(new URL(`dist/${metaFile}`, root), 'utf8');
const { header, body } = verifyDistribution(bundled, metadata, githubChannel);
const { code } = await transform(body, {
  loader: 'js',
  minifyWhitespace: true,
  minifySyntax: false,
  minifyIdentifiers: true,
  lineLimit: 200,
  charset: 'utf8',
  legalComments: 'inline',
});
const output = `${header}\n\n${code}`;
await writeFile(new URL(`dist/${scriptFile}`, root), output);
const license = (await readFile(new URL('LICENSE', root), 'utf8')).trim();
const svelteCopyright = (await readFile(new URL('node_modules/svelte/LICENSE.md', root), 'utf8')).split(/\r?\n/)[0];
if (!output.includes(license) || !output.includes(svelteCopyright)) {
  throw new Error('生产产物缺少必要许可或作者声明');
}
execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`dist/${scriptFile}`, root))], {
  stdio: 'inherit',
});
await packRelease();
console.info(`[观鱼] 生产构建完成：${version}`);
