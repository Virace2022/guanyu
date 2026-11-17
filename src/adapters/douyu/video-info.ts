import { playerRuntime } from './player-actions';
import type { MultiScreenNative } from './multiscreen';
import type { PlayerScreen } from './player-screen';
import { videoMetrics, type VideoMetric } from '../../features/player-info/video';

interface InfoSource { selected: () => number | undefined; read: (id?: number) => PlayerScreen | null; name: (id: number) => string }
const labels: Record<string, string> = {
  'Stream info': '视频参数', 'Close stream info': '关闭视频参数', 'Download bitrate': '下载速率', Diagnostics: '诊断信息', Metadata: '流元数据',
  'Player version': '播放器版本', 'Playback mode': '播放模式', Transport: '传输方式', 'CDN ID': '线路标识', 'P2P ID': 'P2P 标识',
  'CDN host': 'CDN 节点', 'MIME type': '媒体类型', 'Loaded bytes': '已接收流量', 'CDN bytes': 'CDN 流量', 'P2P bytes': 'P2P 流量', 'Dropped bytes': '丢弃流量',
  'Metadata unavailable': '未提供元数据',
  'Network download throughput, not encoded video bitrate. Last 60 seconds, sampled every second.': '网络下载速率，每秒采样，显示最近 60 秒。',
};
let runtime: any, react: any;
function nativeReact() {
  const current = playerRuntime();
  if (!current) return;
  if (runtime === current && react) return react;
  for (const [key, module] of Object.entries(current.c) as [string, any][]) {
    const source = current.m[key]?.toString() ?? '';
    if (!source.includes('cloneElement') || !source.includes('isValidElement')) continue;
    for (const value of [module.exports, module.exports?.default]) if (typeof value?.cloneElement === 'function' && typeof value.isValidElement === 'function') {
      runtime = current; react = value; return react;
    }
  }
}

export function mountNativeVideoInfo(getNative: () => MultiScreenNative, source: InfoSource) {
  let component: any, restore: (() => void) | undefined, watched: Element | null = null;
  let pinned = source.selected();
  function translate(node: any, api: any): any {
    if (typeof node === 'string') return labels[node] ?? node;
    if (Array.isArray(node)) return node.map(item => translate(item, api));
    if (!api.isValidElement(node)) return node;
    const props: Record<string, unknown> = {};
    for (const key of ['aria-label', 'title']) if (typeof node.props[key] === 'string' && labels[node.props[key]]) props[key] = labels[node.props[key]];
    return api.cloneElement(node, props, translate(node.props.children, api));
  }
  function metrics(node: any, rows: VideoMetric[], api: any) {
    const template = (Array.isArray(node.props.children) ? node.props.children : [node.props.children]).find((child: any) => child?.type === 'div');
    if (!template) return node;
    const [label, value] = template.props.children;
    return api.cloneElement(node, null, rows.map(([name, text]) => api.cloneElement(template, { key: `guanyu-${name}` },
      api.cloneElement(label, { title: undefined }, name), api.cloneElement(value, { title: text }, text))));
  }
  function bind(next: any, api: any) {
    restore?.(); component = next;
    const original = { render: next.render, sample: next.samplePlayerStat };
    const sample = () => {
      let stat: any = null;
      try {
        const screen = source.read(pinned);
        if (screen) stat = { ...(screen.main ? next.props.getPlayerStat?.() : {}), mediaInfo: screen.info, statInfo: screen.stats };
      } catch { /* 重连尚未就绪时沿用官方的空样本处理。 */ }
      // 只替换样本来源，速率采样、曲线历史与启停计时仍由官方实例维护。
      next.downloadStats.sample(stat?.statInfo?.loaderBytes, performance.now());
      next.setState({ playerStat: stat, downloadValueMbps: next.downloadStats.valueMbps, downloadSamples: next.downloadStats.samples.slice() });
    };
    const render = function(this: any) {
      const actual = this.props, screen = source.read(pinned);
      let tree: any;
      try {
        if (screen) this.props = { ...actual, width: screen.slot.clientWidth, height: screen.slot.clientHeight,
          ...(screen.main ? {} : { cdn: undefined, p2p: undefined, src: screen.video?.currentSrc ?? '', isRtc: false, isH265: false, getMediaHandle: undefined }) };
        tree = original.render.call(this);
      } finally { this.props = actual; }
      if (!tree) return tree;
      const children = Array.isArray(tree.props.children) ? [...tree.props.children] : [], body = children[1];
      if (!Array.isArray(body?.props?.children) || body.props.children[0]?.type !== 'dl' || body.props.children[1]?.type !== 'dl') return translate(tree, api);
      const contents = [...body.props.children];
      const id = pinned ?? screen?.id, name = id ? source.name(id) : '直播间';
      const rows = videoMetrics(screen, name, id);
      contents[0] = metrics(contents[0], rows.specifications, api); contents[1] = metrics(contents[1], rows.playback, api);
      children[1] = api.cloneElement(body, null, ...contents);
      return translate(api.cloneElement(tree, { lang: 'zh-CN', 'data-guanyu-video-info': '' }, ...children), api);
    };
    next.samplePlayerStat = sample; next.render = render;
    restore = () => {
      if (next.samplePlayerStat === sample) next.samplePlayerStat = original.sample;
      if (next.render === render) next.render = original.render;
      if (next.panel?.isConnected && next.props.isShow) { next.startSampling(); next.forceUpdate(); }
    };
    if (next.props.isShow) next.startSampling();
  }
  function sync() {
    const root = document.getElementById('js-player-video-case');
    if (root !== watched) { observer.disconnect(); watched = root; if (root) observer.observe(root, { childList: true, subtree: true }); }
    const panel = root?.querySelector('[aria-label="Stream info"], [data-guanyu-video-info]');
    if (!panel) return;
    const next = getNative().component(panel, (value: any) => value.props?.__module_id__ === 'videoInfo' && typeof value.samplePlayerStat === 'function');
    if (!next || next === component || typeof next.downloadStats?.sample !== 'function') return;
    const api = nativeReact(); if (api) bind(next, api);
  }
  const observer = new MutationObserver(sync), timer = setInterval(sync, 1000);
  const select = (event: MouseEvent) => {
    const item = (event.target as Element)?.closest?.('li');
    if (!item?.parentElement?.matches('.menu-da2a9e:not(.subMenu-de1c61)') || item.hasAttribute('data-guanyu-action') || item.textContent?.trim() !== '查看视频参考信息') return;
    pinned = source.selected();
    if (component?.props.isShow) component.startSampling();
  };
  document.addEventListener('click', select, true); sync();
  return () => { clearInterval(timer); observer.disconnect(); document.removeEventListener('click', select, true); restore?.(); component = undefined; };
}
