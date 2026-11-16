import { homepage, version } from './release-config.mjs';

/** 读取管理器实际使用的元数据头与脚本正文。
 * @param {string} script
 */
export function readUserscript(script) {
  const header = script.match(/^\/\/ ==UserScript==\r?\n[\s\S]*?^\/\/ ==\/UserScript==/m)?.[0];
  if (!header || !script.startsWith(header)) throw new Error('缺少用户脚本元数据头');
  const fields = new Map([...header.matchAll(/^\/\/\s+@(\S+)\s+(.+)$/gm)]
    .map(([, key, value]) => [key, value.trim()]));
  return { header, fields, body: script.slice(header.length) };
}

/** 只替换渠道地址，保留安装身份、权限及功能代码。
 * @param {string} header
 * @param {{ updateURL: string, downloadURL: string }} channel
 */
export function channelHeader(header, channel) {
  return header
    .replace(/^(\/\/\s+@updateURL\s+)\S+$/m, (_, prefix) => `${prefix}${channel.updateURL}`)
    .replace(/^(\/\/\s+@downloadURL\s+)\S+$/m, (_, prefix) => `${prefix}${channel.downloadURL}`);
}

/** 按公开分发契约核对完整脚本与更新元数据。
 * @param {string} script
 * @param {string} metadata
 * @param {{ updateURL: string, downloadURL: string }} channel
 */
export function verifyDistribution(script, metadata, channel) {
  const result = readUserscript(script);
  if (metadata.trim() !== result.header) throw new Error('完整脚本与更新元数据不一致');
  for (const [key, value] of Object.entries({
    name: '观鱼', namespace: homepage, version,
    updateURL: channel.updateURL, downloadURL: channel.downloadURL,
  })) {
    if (result.fields.get(key) !== value) {
      throw new Error(`@${key} 应为 ${value}，实际为 ${result.fields.get(key) ?? '缺失'}`);
    }
  }
  if (!result.body.trim()) throw new Error('完整脚本缺少功能代码');
  return result;
}
