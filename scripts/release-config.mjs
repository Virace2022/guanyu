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
export const githubChannel = {
  id: 'github', name: 'GitHub Release',
  installURL: `${homepage}/releases/latest/download/${scriptFile}`,
  updateURL: `${homepage}/releases/latest/download/${metaFile}`,
  downloadURL: `${homepage}/releases/latest/download/${scriptFile}`,
};
export const cdnChannels = [
  { id: 'fastly', name: 'jsDelivr · Fastly', host: 'fastly.jsdelivr.net', directory: 'dist/fastly' },
  { id: 'quantil', name: 'jsDelivr · Quantil', host: 'quantil.jsdelivr.net', directory: 'dist/quantil' },
  { id: 'jsdelivr', name: 'jsDelivr · 默认节点', host: 'cdn.jsdelivr.net', directory: 'dist' },
  { id: 'jsdmirror', name: 'jsdmirror', host: 'cdn.jsdmirror.com', directory: 'dist/jsdmirror' },
].map(channel => ({
  ...channel,
  installURL: `https://${channel.host}/npm/${packageName}@${version}/${channel.directory}/${scriptFile}`,
  updateURL: `https://${channel.host}/npm/${packageName}@latest/${channel.directory}/${metaFile}`,
  downloadURL: `https://${channel.host}/npm/${packageName}@latest/${channel.directory}/${scriptFile}`,
}));
export const channels = [githubChannel, ...cdnChannels];
export const { updateURL, downloadURL } = githubChannel;
export const iconURL = `https://cdn.jsdelivr.net/gh/${repository}@${tag}/assets/brand/guanyu.svg`;
export const releaseFiles = [scriptFile, metaFile, tarballFile, 'SHA256SUMS'];
