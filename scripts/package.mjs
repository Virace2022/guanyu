import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import project from '../package.json' with { type: 'json' };
import {
  cdnChannels, githubChannel, homepage, metaFile, packageName, registry, releaseFiles, scriptFile, tarballFile, version,
} from './release-config.mjs';
import { channelHeader, verifyDistribution } from './distribution.mjs';

export async function packRelease() {
  const root = new URL('../', import.meta.url);
  const stage = new URL('dist/npm/', root);
  await mkdir(stage, { recursive: true });
  const manifest = {
    name: packageName, version, description: project.description, license: project.license,
    author: project.author, repository: project.repository, homepage,
    bugs: { url: `${homepage}/issues` },
    keywords: ['douyu', 'userscript', 'tampermonkey'],
    files: ['dist/'],
    publishConfig: { access: 'public', registry },
  };
  await writeFile(new URL('package.json', stage), `${JSON.stringify(manifest, null, 2)}\n`);
  const installs = [githubChannel, ...cdnChannels].map(channel => `- [${channel.name}](${channel.installURL})`).join('\n');
  await writeFile(new URL('README.md', stage), `# 观鱼\n\n斗鱼网页看播增强用户脚本。\n\n${installs}\n\n[使用说明与源码](${homepage}) · [反馈问题](${homepage}/issues)\n\n通过用户脚本管理器安装，检查更新与下载新版沿用所选渠道。采用 MIT 许可。\n`);
  await copyFile(new URL('LICENSE', root), new URL('LICENSE', stage));
  const script = await readFile(new URL(`dist/${scriptFile}`, root), 'utf8');
  const metadata = await readFile(new URL(`dist/${metaFile}`, root), 'utf8');
  const { header, body } = verifyDistribution(script, metadata, githubChannel);
  const expected = ['package.json', 'README.md', 'LICENSE'];
  for (const channel of cdnChannels) {
    const directory = new URL(`${channel.directory}/`, stage);
    await mkdir(directory, { recursive: true });
    const updatedHeader = channelHeader(header, channel);
    await writeFile(new URL(scriptFile, directory), `${updatedHeader}${body}`);
    await writeFile(new URL(metaFile, directory), `${updatedHeader}\n`);
    const installed = await readFile(new URL(scriptFile, directory), 'utf8');
    const update = await readFile(new URL(metaFile, directory), 'utf8');
    const result = verifyDistribution(installed, update, channel);
    if (result.body !== body || channelHeader(result.header, githubChannel) !== header) {
      throw new Error(`${channel.name} 的功能代码或安装元数据与 GitHub 不一致`);
    }
    expected.push(`${channel.directory}/${scriptFile}`, `${channel.directory}/${metaFile}`);
  }
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('请通过 npm run build 执行生产构建');
  const [packed] = JSON.parse(execFileSync(process.execPath, [npm, 'pack', './dist/npm',
    '--pack-destination', './dist', '--ignore-scripts', '--json'], {
    cwd: fileURLToPath(root), encoding: 'utf8',
  }));
  const actual = new Set(packed.files.map(/** @param {{ path: string }} file */ (file) => file.path));
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
