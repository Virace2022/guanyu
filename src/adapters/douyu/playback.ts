import type { PlaybackOptions } from '../../config/enhancements';
import type { PlayerStore } from './player';

function component(node: Element | null, accepts: (value: any) => boolean): any {
  if (!node) return null;
  for (const element of [node, ...node.querySelectorAll('*')]) {
    const key = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
    let fiber = key ? (element as any)[key] : undefined, root = fiber;
    while (root?.return) root = root.return;
    if (root?.stateNode?.current === root?.alternate && fiber?.alternate) fiber = fiber.alternate;
    for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) if (fiber.stateNode && accepts(fiber.stateNode)) return fiber.stateNode;
  }
  return null;
}

export function mountPlayback(player: PlayerStore, isLive: () => boolean, report: (message: string) => void) {
  let options: PlaybackOptions, fullscreenApplied = false, qualityApplied = false, room = '', volume: Element | null = null;
  function wheel(event: Event) {
    const e = event as WheelEvent;
    if (!options.volumeWheel || !e.deltaY || e.ctrlKey || e.target instanceof Element && e.target.closest('[data-guanyu-gain]')) return;
    const video = player.value.video;
    if (!video) return;
    e.preventDefault(); e.stopPropagation();
    const next = Math.max(0, Math.min(1, Math.round((video.volume + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
    const native = component(volume, value => typeof value.changeVolume === 'function' && value.actions?.call);
    if (!native) { report('原生音量服务尚未就绪'); return; }
    // 原生动作只同步控制栏状态，媒体音量沿用旧滚轮逻辑；存储 v 保持官方的二次 JSON 编码。
    video.muted = next === 0;
    video.volume = next;
    native.actions.call({ id: 'videoModule', action: 'changeVolume', data: [next] });
    try {
      for (const key of ['volume_muted_before_key', 'player_storage_volume_h5p_room']) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const saved = JSON.parse(raw);
        saved.v = JSON.stringify(next);
        localStorage.setItem(key, JSON.stringify(saved));
      }
    } catch (cause) { report(`音量已调整，记忆未写入：${String(cause)}`); return; }
    report('');
  }
  function sync() {
    if (!options) return;
    if (room !== player.value.roomId) { room = player.value.roomId || ''; fullscreenApplied = qualityApplied = false; }
    const nextVolume = options.volumeWheel ? player.value.volume : null;
    if (nextVolume !== volume) { volume?.removeEventListener('wheel', wheel, true); volume = nextVolume; volume?.addEventListener('wheel', wheel, { passive: false, capture: true }); }
    const bar = document.getElementById('js-player-controlbar');
    if (options.autoWebFullscreen && !fullscreenApplied && isLive()) {
      const control = component(bar, value => typeof value.changePageFullscreenState === 'function');
      if (control) {
        if (!control.props.isWebFullscreen && !control.props.isFullscreen) {
          // 点击原生按钮以保留官方网页全屏状态和退出行为。
          const button = bar?.querySelector<HTMLElement>('.wfs-2a8e83') ?? bar?.querySelector<HTMLElement>('.right-17e251 > .icon-c8be96:nth-last-child(2)');
          if (!button) return;
          button.click();
        }
        fullscreenApplied = true;
      }
    }
    if (options.highestQuality && !qualityApplied) {
      const rate = component(bar, value => typeof value.onMultirateChange === 'function' && Array.isArray(value.props?.multirates));
      const highest = rate?.props.multirates[0];
      if (highest) {
        qualityApplied = true;
        // 原生画质项悬停后才渲染，直接复用同一处理器，保留钻粉等档位的官方检查。
        if (Number(rate.props.rate) !== Number(highest.type)) void Promise.resolve(rate.onMultirateChange(highest)).catch(error => report(`画质切换失败：${String(error)}`));
      }
    }
  }
  const stop = player.subscribe(sync), timer = setInterval(sync, 1000);
  return {
    apply(value: PlaybackOptions) {
      if (options && !options.autoWebFullscreen && value.autoWebFullscreen) fullscreenApplied = false;
      if (options && !options.highestQuality && value.highestQuality) qualityApplied = false;
      options = value; sync();
    },
    dispose() { stop(); clearInterval(timer); volume?.removeEventListener('wheel', wheel, true); },
  };
}
