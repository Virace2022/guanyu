import { readMetadata } from '../features/player-info/metadata';
import type { PlayerStore } from '../adapters/douyu/player';
import type { SettingsStore } from '../config/settings';
import { diagnostics } from '../core/diagnostics';

interface Metadata { metadata?: Record<string, unknown>; width?: number; height?: number; fps?: number }

export function createPlayerInfo(player: PlayerStore, settings: SettingsStore) {
  const element = document.createElement('ul'); element.className = 'guanyu-player-info'; element.setAttribute('aria-label', '主播配置信息');
  let roomId: string | null = null, request: AbortController | undefined, requested = false, loaded = false;
  function render(rows: string[][]) {
    const focused = element.contains(document.activeElement);
    element.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement('li'); row.tabIndex = 0; row.setAttribute('role', 'menuitem');
      row.append(label!);
      if (value) { row.append(document.createElement('br'), value); row.title = value; }
      element.append(row);
    }
    if (focused) (element.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
  }
  async function prepare() {
    if (!roomId || request || loaded) return;
    const expected = roomId, abort = new AbortController(); request = abort; requested = true;
    render([['正在读取主播配置信息…']]);
    try {
      const info = await readMetadata(expected, abort.signal) as Metadata;
      if (abort.signal.aborted || expected !== roomId) return;
      const fields = [['dy_cpu_model', '🤖CPU'], ['dy_gpu_model', '🎮显卡'], ['dy_device_model', '📱设备'], ['dy_os_version', '🖥️系统'], ['z_canvas_code', '🎥场景']];
      const rows = fields.filter(([key]) => info.metadata?.[key!] != null).map(([key, label]) => [label!, String(info.metadata![key!])]);
      if (info.width && info.height) rows.push([`📺直播画面 ${info.width} × ${info.height}${info.fps ? ` · ${info.fps} fps` : ''}`]);
      loaded = true; render(rows);
      diagnostics.report('menu.roomInfo', rows.length ? 'ready' : 'idle', rows.length ? '已读取并展示直播流中的主播配置' : '直播流未提供可展示的主播配置');
    } catch (error) {
      if (!abort.signal.aborted && expected === roomId) { diagnostics.report('menu.roomInfo', 'error', String(error instanceof Error ? error.message : error)); render([[String(error instanceof Error ? error.message : error)], ['再次悬停可重试']]); }
    } finally { if (request === abort) request = undefined; }
  }
  function sync() {
    const next = player.value.video ? player.value.roomId : null;
    if (next !== roomId) { request?.abort(); request = undefined; roomId = next; requested = loaded = false; render([['正在读取主播配置信息…']]); }
    if (!settings.value.playerMenu.includes('roomInfo')) { request?.abort(); request = undefined; requested = false; return; }
    if (!requested) void prepare();
  }
  const stopPlayer = player.subscribe(sync), stopSettings = settings.subscribe(sync);
  return { submenu: { element, prepare }, dispose() { stopPlayer(); stopSettings(); request?.abort(); element.remove(); } };
}
