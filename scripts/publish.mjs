import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  packageName, registry, releaseFiles, repository, tag, tarballFile, version,
} from './release-config.mjs';
import { checkTag } from './version.mjs';

checkTag(version, process.env.GITHUB_REF_NAME);
if (process.env.GITHUB_REPOSITORY !== repository) {
  throw new Error(`发布仓库须为 ${repository}`);
}
const token = process.env.GH_TOKEN;
const npm = process.env.npm_execpath;
if (!token || !npm) throw new Error('请在发布工作流中通过 npm run release:publish 执行');
const root = new URL('../', import.meta.url);
const tarball = await readFile(new URL(`dist/${tarballFile}`, root));
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
const npmResponse = await fetch(`${registry}/${encodeURIComponent(packageName)}/${version}`, {
  signal: AbortSignal.timeout(30000),
});
let npmPublished = false;
if (npmResponse.ok) {
  const previous = /** @type {{ dist?: { integrity?: string } }} */ (await npmResponse.json());
  if (previous.dist?.integrity !== integrity) {
    throw new Error(`${packageName}@${version} 已存在，内容与当前发布包不同；请准备新版本`);
  }
  npmPublished = true;
} else if (npmResponse.status !== 404) {
  throw new Error(`查询 npm 已发布版本失败：HTTP ${npmResponse.status}`);
}

const releaseResponse = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
  headers: {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
  signal: AbortSignal.timeout(30000),
});
if (!releaseResponse.ok && releaseResponse.status !== 404) {
  throw new Error(`查询 GitHub Release 失败：HTTP ${releaseResponse.status}`);
}
const previousRelease = releaseResponse.ok
  ? /** @type {{ draft: boolean, assets: { name: string, digest: string | null }[] }} */ (await releaseResponse.json())
  : null;
const assets = releaseFiles.map(file => `dist/${file}`);

/** @param {string[]} args */
function gh(args) {
  execFileSync('gh', [...args, '--repo', repository], { cwd: fileURLToPath(root), stdio: 'inherit' });
}

if (previousRelease && !previousRelease.draft) {
  // 已公开的附件不可覆盖；重跑只接受同一份构建产物。
  for (const file of releaseFiles) {
    const data = await readFile(new URL(`dist/${file}`, root));
    const digest = `sha256:${createHash('sha256').update(data).digest('hex')}`;
    const asset = previousRelease.assets.find(/** @param {{ name: string }} item */ (item) => item.name === file);
    if (asset?.digest !== digest) throw new Error(`已公开的 Release 附件不一致：${file}`);
  }
} else if (previousRelease) {
  gh(['release', 'upload', tag, ...assets, '--clobber']);
} else {
  gh(['release', 'create', tag, ...assets, '--verify-tag', '--draft', '--title', tag, '--generate-notes']);
}

if (!npmPublished) {
  execFileSync(process.execPath, [npm, 'publish', `dist/${tarballFile}`, '--access', 'public',
    '--registry', registry], { cwd: fileURLToPath(root), stdio: 'inherit' });
} else {
  console.info(`[观鱼] npm 已存在相同发布包，跳过重复上传：${packageName}@${version}`);
}
if (!previousRelease || previousRelease.draft) gh(['release', 'edit', tag, '--draft=false', '--latest']);
console.info(`[观鱼] npm 与 GitHub Release 发布完成：${tag}`);
