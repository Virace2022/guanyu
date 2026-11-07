import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import project from '../package.json' with { type: 'json' };
import {
  homepage, installURL, metaFile, packageName, registry, releaseFiles, scriptFile, tarballFile, version,
} from './release-config.mjs';

export async function packRelease() {
  const root = new URL('../', import.meta.url);
  const stage = new URL('dist/npm/', root);
  await mkdir(new URL('dist/', stage), { recursive: true });
  const manifest = {
    name: packageName, version, description: project.description, license: project.license,
    author: project.author, repository: project.repository, homepage,
    bugs: { url: `${homepage}/issues` },
    keywords: ['douyu', 'userscript', 'tampermonkey'],
    files: ['dist/'],
    publishConfig: { access: 'public', registry },
  };
  await writeFile(new URL('package.json', stage), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(new URL('README.md', stage), `# 观鱼\n\n斗鱼网页看播增强用户脚本。\n\n[安装当前版本](${installURL}) · [使用说明与源码](${homepage}) · [反馈问题](${homepage}/issues)\n\n通过用户脚本管理器安装，后续更新由管理器处理。采用 MIT 许可。\n`);
  await copyFile(new URL('LICENSE', root), new URL('LICENSE', stage));
  for (const file of [scriptFile, metaFile]) {
    await copyFile(new URL(`dist/${file}`, root), new URL(`dist/${file}`, stage));
  }
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('请通过 npm run build 执行生产构建');
  const [packed] = JSON.parse(execFileSync(process.execPath, [npm, 'pack', './dist/npm',
    '--pack-destination', './dist', '--ignore-scripts', '--json'], {
    cwd: fileURLToPath(root), encoding: 'utf8',
  }));
  const actual = new Set(packed.files.map(/** @param {{ path: string }} file */ (file) => file.path));
  const expected = ['package.json', 'README.md', 'LICENSE', `dist/${scriptFile}`, `dist/${metaFile}`];
  if (packed.filename !== tarballFile || actual.size !== expected.length || expected.some(file => !actual.has(file))) {
    throw new Error('npm 发布包文件与精简发布清单不一致');
  }
  const checksums = [];
  for (const file of releaseFiles.filter(file => file !== 'SHA256SUMS')) {
    const data = await readFile(new URL(`dist/${file}`, root));
    checksums.push(`${createHash('sha256').update(data).digest('hex')}  ${file}`);
  }
  await writeFile(new URL('dist/SHA256SUMS', root), `${checksums.join('\n')}\n`);
  console.info(`[观鱼] npm 发布包：dist/${tarballFile}，${packed.size} 字节，${actual.size} 个文件`);
}
