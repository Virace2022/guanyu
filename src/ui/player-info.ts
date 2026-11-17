import type { ScreenController } from '../features/multiscreen/screens';
import { diagnostics } from '../core/diagnostics';

export function createPlayerInfo(screens: ScreenController) {
  const element = document.createElement('ul'); element.className = 'guanyu-player-info guanyu-device-info';
  element.setAttribute('aria-label', '主播配置信息');
  let signature = '';
  function prepare() {
    const screen = screens.current(), rows: [string, string][] = [];
    if (!screen) rows.push(['画面已变化', '请重新右键选择直播间']);
    else {
      const metadata = screen.info.metadata ?? {};
      const fields = [['dy_cpu_model', '🤖 CPU'], ['dy_gpu_model', '🎮 显卡'], ['dy_device_model', '📱 设备'], ['dy_os_version', '🖥️ 系统'], ['z_canvas_code', '🎥 场景']];
      for (const [key, label] of fields) if (metadata[key!] != null) rows.push([label!, String(metadata[key!])]);
      if (!rows.length) rows.push(['设备信息', '当前直播流未提供']);
      diagnostics.report('menu.roomInfo', rows[0]?.[0] === '设备信息' ? 'idle' : 'ready', '已直接读取当前画面 SDK 中的主播配置');
    }
    const next = JSON.stringify(rows); if (next === signature) return;
    const focused = [...element.children].indexOf(document.activeElement as Element);
    signature = next; element.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement('li'); row.tabIndex = -1; row.setAttribute('role', 'menuitem');
      const name = document.createElement('span'), detail = document.createElement('span'); name.className = 'guanyu-info-label'; detail.className = 'guanyu-info-value';
      name.textContent = label; detail.textContent = value; row.append(name, detail); element.append(row);
    }
    if (focused >= 0) (element.children[Math.min(focused, element.children.length - 1)] as HTMLElement | undefined)?.focus({ preventScroll: true });
  }
  const timer = setInterval(() => { if (element.parentElement?.matches(':hover, :focus-within')) prepare(); }, 1000);
  return { submenu: { element, prepare }, dispose() { clearInterval(timer); element.remove(); } };
}
