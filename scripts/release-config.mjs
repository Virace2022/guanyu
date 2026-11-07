import project from '../package.json' with { type: 'json' };
import state from '../version.json' with { type: 'json' };
import { parseVersion } from './version.mjs';

export const version = parseVersion(state.version).version;
export const packageName = project.name;
export const tag = `v${version}`;
export const homepage = project.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
export const repository = new URL(homepage).pathname.slice(1);
export const registry = 'https://registry.npmjs.org';
export const scriptFile = 'douyu.guanyu.user.js';
export const metaFile = 'douyu.guanyu.meta.js';
export const tarballFile = `${packageName.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
export const updateURL = `https://cdn.jsdelivr.net/npm/${packageName}@latest/dist/${metaFile}`;
export const downloadURL = `https://cdn.jsdelivr.net/npm/${packageName}@latest/dist/${scriptFile}`;
export const installURL = `https://cdn.jsdelivr.net/npm/${packageName}@${version}/dist/${scriptFile}`;
export const releaseFiles = [scriptFile, metaFile, tarballFile, 'SHA256SUMS'];
