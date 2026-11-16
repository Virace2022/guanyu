import { channels } from './release-config.mjs';
import { verifyDistribution } from './distribution.mjs';

/** 直接读取公开入口，不使用本地产物替代网络结果。
 * @param {string} url
 * @param {string} label
 */
async function download(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const finalURL = new URL(response.url);
  console.info(`[观鱼] ${label}：HTTP ${response.status}，${finalURL.origin}${finalURL.pathname}`);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${label} 返回 HTTP ${response.status}`);
  }
  return response.text();
}

const results = await Promise.allSettled(channels.map(async channel => {
  const install = download(channel.installURL, `${channel.name} 首次安装`);
  const [script, metadata, update] = await Promise.all([
    install,
    download(channel.updateURL, `${channel.name} 检查更新`),
    channel.downloadURL === channel.installURL ? install : download(channel.downloadURL, `${channel.name} 下载新版`),
  ]);
  const parsed = verifyDistribution(script, metadata, channel);
  const updated = verifyDistribution(update, metadata, channel);
  if (parsed.body !== updated.body) throw new Error('首次安装与更新下载的功能代码不一致');
  return { channel, ...parsed };
}));
const github = results[0];
for (let i = 0; i < results.length; i++) {
  const result = results[i];
  const channel = channels[i];
  if (result.status === 'rejected') {
    console.error(`[观鱼] ${channel.name} 验证失败：${result.reason.message}`);
    process.exitCode = 1;
  } else if (github.status === 'fulfilled'
    && result.value.body !== github.value.body) {
    console.error(`[观鱼] ${channel.name} 功能代码与 GitHub Release 不一致`);
    process.exitCode = 1;
  } else {
    console.info(`[观鱼] ${channel.name} 安装与更新地址、元数据、版本验证通过`);
  }
}
if (github.status === 'rejected') console.error('[观鱼] GitHub 基准未通过，无法确认跨渠道功能代码一致');
