import type { MultiAudio } from '../../features/multiscreen/audio';
import type { MultiScreenNative } from './multiscreen';
import type { RoomData } from './rooms';
import styles from '../../ui/multiscreen-audio.css?style';

const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!;
const muted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted')!;

interface Media {
  video: HTMLVideoElement;
  id: number;
  main: boolean;
  restore: () => void;
}
interface Label {
  node: HTMLElement;
  source: HTMLElement | null;
  slot: HTMLElement;
  id: number;
  main: boolean;
  button: HTMLButtonElement;
  offset: { left: number; bottom: number };
  panel: HTMLElement;
  slider: HTMLInputElement;
  output: HTMLOutputElement;
  dispose: () => void;
}

export function mountMultiscreenAudio(getNative: () => MultiScreenNative, audio: MultiAudio, room: (id: number) => RoomData | undefined) {
  const style = styles.cloneNode(true); document.head.append(style);
  const media = new Map<HTMLVideoElement, Media>(), labels = new Map<HTMLElement, Label>();
  let enabled = true, centerLabels = true, connected = false, syncing = false, frame = 0, native: MultiScreenNative | null = null;
  let container: HTMLElement | null = null, layer: HTMLElement | null = null, unsubscribe: (() => void) | undefined;
  let nativeVolume = 0;
  const observer = new MutationObserver(schedule), resize = new ResizeObserver(schedule);

  function schedule() { if (!frame) frame = requestAnimationFrame(sync); }
  function writeMedia(record: Media) {
    const amount = audio.output(record.id);
    if (volume.get!.call(record.video) !== amount) volume.set!.call(record.video, amount);
    if (muted.get!.call(record.video) !== (amount === 0)) muted.set!.call(record.video, amount === 0);
  }
  function bindMedia(video: HTMLVideoElement, id: number, main: boolean) {
    const ownVolume = Object.getOwnPropertyDescriptor(video, 'volume'), ownMuted = Object.getOwnPropertyDescriptor(video, 'muted');
    const record: Media = { video, id, main, restore() {
      if (ownVolume) Object.defineProperty(video, 'volume', ownVolume); else delete (video as Partial<HTMLVideoElement>).volume;
      if (ownMuted) Object.defineProperty(video, 'muted', ownMuted); else delete (video as Partial<HTMLVideoElement>).muted;
      volume.set!.call(video, main && !audio.value.muted ? audio.value.master : 0);
      muted.set!.call(video, main ? audio.value.muted : true);
    } };
    // 主视频向官方服务呈现总音量，实际输出经原生属性写入，避免 SDK 回读后重复乘上房间比例。
    Object.defineProperties(video, {
      volume: { configurable: true, get: () => main ? audio.value.muted ? 0 : audio.value.master : volume.get!.call(video), set: (value: number) => {
        if (main && !(value === 0 && audio.value.muted)) audio.setMaster(value); else writeMedia(record);
      } },
      muted: { configurable: true, get: () => main ? audio.value.muted : muted.get!.call(video), set: (value: boolean) => {
        if (main && (value || nativeVolume > 0)) audio.setMuted(!!value); else writeMedia(record);
      } },
    });
    media.set(video, record); writeMedia(record);
  }

  function makeLabel(slot: HTMLElement, id: number, main: boolean, template: HTMLElement): Label {
    const source = main ? null : slot.querySelector<HTMLElement>('.multi-screen-nick-icon');
    const face = source || template;
    const decoration = getComputedStyle(face);
    const offset = { left: parseFloat(decoration.left) || 0, bottom: parseFloat(decoration.bottom) || 0 };
    const node = face.cloneNode(false) as HTMLElement;
    node.classList.remove('guanyu-audio-native-hidden');
    for (const child of Array.from(face.children).slice(0, 2)) node.append(child.cloneNode(true));
    node.classList.add('guanyu-audio-label'); node.dataset.guanyuAudioRoom = String(id);
    const avatar = node.children[0] as HTMLElement, name = node.children[1] as HTMLElement;
    if (main) name.style.cursor = 'default';
    source?.classList.add('guanyu-audio-native-hidden');
    layer!.append(node);
    const component = !main ? native!.component(slot, (value: any) => value.baseStream && typeof value.multiClickHandle === 'function') : null;
    const originalClick = component?.multiClickHandle;
    let replacement: ((event: any) => void) | undefined;
    if (component && originalClick) {
      // 官方跳转按旧左下角坐标命中；名称改用原回调触发，加载重试仍走原逻辑。
      replacement = (event: any) => { if (component.state.isLoading) originalClick.call(component, event); };
      native!.core.d.off('Event_multiClick', originalClick);
      component.multiClickHandle = replacement;
      native!.core.d.on('Event_multiClick', replacement);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'guanyu-audio-switch';
    button.setAttribute('aria-haspopup', 'dialog');
    const panel = document.createElement('div'); panel.className = 'guanyu-audio-panel'; panel.setAttribute('role', 'dialog');
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.setAttribute('aria-orientation', 'vertical');
    const output = document.createElement('output'); panel.append(slider, output); node.append(button, panel);
    const stop = (event: Event) => event.stopPropagation();
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'dblclick', 'contextmenu']) node.addEventListener(type, stop);
    const navigate = (event: MouseEvent) => {
      event.stopPropagation();
      if (originalClick) {
        const rect = slot.getBoundingClientRect();
        originalClick.call(component, { curRid: id, x: 11, y: rect.height - 21, width: rect.width, height: rect.height });
      }
    };
    name.addEventListener('click', navigate);
    button.onclick = event => { event.stopPropagation(); audio.select(id); };
    slider.oninput = () => audio.setLevel(id, Number(slider.value) / 100);
    slider.onclick = stop;
    const keydown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); node.classList.add('guanyu-audio-dismissed'); button.focus(); }
      else if (audio.value.independent && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.target === button) {
        event.preventDefault(); node.classList.remove('guanyu-audio-dismissed'); slider.focus();
      }
    };
    const enter = () => node.classList.remove('guanyu-audio-dismissed');
    node.addEventListener('keydown', keydown); button.addEventListener('pointerenter', enter);
    const wheel = (event: WheelEvent) => {
      if (!audio.value.independent || event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); event.stopPropagation();
      audio.setLevel(id, (audio.value.levels.get(id) ?? 0) + (event.deltaY < 0 ? .05 : -.05));
    };
    button.addEventListener('wheel', wheel, { passive: false }); panel.addEventListener('wheel', wheel, { passive: false });
    return { node, source, slot, id, main, button, offset, panel, slider, output, dispose() {
      if (component && replacement) {
        native?.core.d.off('Event_multiClick', replacement);
        if (component.multiClickHandle === replacement) {
          component.multiClickHandle = originalClick;
          if (component.contDom?.isConnected) native?.core.d.on('Event_multiClick', originalClick);
        }
      }
      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'dblclick', 'contextmenu']) node.removeEventListener(type, stop);
      name.removeEventListener('click', navigate); node.removeEventListener('keydown', keydown); button.removeEventListener('pointerenter', enter);
      button.removeEventListener('wheel', wheel); panel.removeEventListener('wheel', wheel);
      node.remove(); source?.classList.remove('guanyu-audio-native-hidden');
    } };
  }

  function paint() {
    if (!connected || !native) return;
    for (const record of media.values()) writeMedia(record);
    const value = audio.value, master = value.muted ? 0 : value.master;
    if (nativeVolume !== master) {
      nativeVolume = master;
      native.control.actions.call({ id: 'videoModule', action: 'changeVolume', data: [master] });
    }
    const bounds = layer!.getBoundingClientRect();
    const controls = document.querySelector<HTMLElement>('#js-player-controlbar > [class*="ControlBar-"]');
    const controlsTop = controls && !controls.classList.contains('is-hidden') ? bounds.bottom - controls.offsetHeight : controls?.getBoundingClientRect().top ?? bounds.bottom;
    const icon = document.querySelector('.volume-07c230 > i');
    for (const label of labels.values()) {
      const rect = label.slot.getBoundingClientRect(), right = rect.left + rect.width / 2 > bounds.left + bounds.width / 2;
      const bottom = rect.top + rect.height / 2 > bounds.top + bounds.height / 2;
      const topEdge = centerLabels && bottom, leftEdge = !centerLabels || right;
      const edgeX = centerLabels ? 10 : label.offset.left, edgeY = centerLabels ? 10 : label.offset.bottom;
      const corner = `${topEdge ? 'top' : 'bottom'}-${leftEdge ? 'left' : 'right'}`;
      if (label.node.dataset.guanyuAudioCorner !== corner) label.node.dataset.guanyuAudioCorner = corner;
      label.node.dataset.guanyuAudioMode = value.independent ? 'independent' : 'solo';
      const selected = value.independent ? (value.levels.get(label.id) ?? 0) > 0 : value.selected === label.id;
      const audible = selected && !value.muted && value.master > 0;
      label.node.dataset.guanyuAudioSelected = String(audible);
      const info = room(label.id), name = label.source?.children[1].textContent || info?.nn || label.node.children[1].textContent || `房间 ${label.id}`;
      if (label.node.children[1].textContent !== name) label.node.children[1].textContent = name;
      const face = (label.source?.children[0] as HTMLElement | undefined)?.style.backgroundImage || (info?.avt ? `url("${info.avt}")` : '');
      if (face && (label.node.children[0] as HTMLElement).style.backgroundImage !== face) (label.node.children[0] as HTMLElement).style.backgroundImage = face;
      label.node.style.left = `${leftEdge ? rect.left - bounds.left + edgeX : rect.right - bounds.left - label.node.offsetWidth - edgeX}px`;
      let top = topEdge ? rect.top - bounds.top + edgeY : rect.bottom - bounds.top - label.node.offsetHeight - edgeY;
      // 原生左下角与底部控制栏会重叠，展开控制栏时让出它的操作区域。
      if (!centerLabels && top + bounds.top + label.node.offsetHeight > controlsTop) top = controlsTop - bounds.top - label.node.offsetHeight - 8;
      label.node.style.top = `${top}px`;
      const action = value.independent ? selected ? '静音' : '恢复声音' : selected && !value.muted ? '静音' : '切换声音到';
      label.button.setAttribute('aria-label', `${action}${name}`); label.button.setAttribute('aria-pressed', String(audible));
      label.button.title = value.independent ? `${name} · 悬停调节独立音量` : `${name} · 点击切换发声房间`;
      const markup = icon?.innerHTML || '';
      if (label.button.innerHTML !== markup) label.button.innerHTML = markup;
      label.panel.hidden = !value.independent; label.button.setAttribute('aria-haspopup', value.independent ? 'dialog' : 'false');
      label.slider.setAttribute('aria-label', `${name}独立音量`);
      const level = Math.round((value.levels.get(label.id) ?? 0) * 100);
      if (label.slider.value !== String(level)) label.slider.value = String(level);
      if (label.output.value !== `${level}%`) label.output.value = `${level}%`;
    }
  }

  function detach() {
    if (!connected && !container) return;
    connected = false; observer.disconnect(); resize.disconnect(); unsubscribe?.(); unsubscribe = undefined;
    for (const label of labels.values()) label.dispose(); labels.clear();
    for (const record of media.values()) record.restore(); media.clear();
    layer?.remove(); layer = null; container = null; native = null; audio.disconnect();
  }
  function sync() {
    frame = 0;
    if (syncing) return;
    syncing = true;
    try {
      const current = getNative();
      if (!enabled || !current.service || !current.core || !current.active() || !current.container?.isConnected) { detach(); return; }
      if (native && (native !== current || container !== current.container || !layer?.isConnected)) detach();
      if (current.service.$dragBox) return;
      const host = current.container as HTMLElement, ids = current.order();
      if (ids.length < 2) { detach(); return; }
      const main = Array.from(media.values()).find(record => record.main && record.video.isConnected)?.video
        ?? host.querySelector<HTMLVideoElement>('#js-player-video-first video') ?? host.querySelector<HTMLVideoElement>('.layout-Player-videoEntity video');
      const editor = document.querySelector<HTMLElement>('[class*="mutiPlayerEditPanel-"]');
      if (!main || !editor) return;
      if (!connected) {
        native = current; container = host;
        layer = document.createElement('div'); layer.className = 'guanyu-audio-layer';
        const overlay = editor.parentElement!;
        const barrage = overlay.querySelector<HTMLElement>(':scope > [class^="comment-"]');
        // 与弹幕同层并排在它后面，保留原生操作层和编辑面板对音量入口的覆盖关系。
        overlay.insertBefore(layer, barrage?.nextSibling ?? editor);
        nativeVolume = Number(current.store.getState().getIn(['videoModule', 'player', 'volume'])) || 0;
        audio.connect(ids, current.roomId, nativeVolume, muted.get!.call(main));
        connected = true;
        observer.observe(host, { childList: true, subtree: true }); resize.observe(host);
        const controls = document.getElementById('js-player-controlbar');
        if (controls) observer.observe(controls, { attributes: true, subtree: true, attributeFilter: ['class'] });
        unsubscribe = current.store.subscribe(() => {
          const next = Number(current.store.getState().getIn(['videoModule', 'player', 'volume'])) || 0;
          if (next !== nativeVolume) { nativeVolume = next; audio.setMaster(next); }
          schedule();
        });
      } else audio.connect(ids, current.roomId, audio.value.master, audio.value.muted);
      const slots = Array.from(host.children).slice(0, ids.length) as HTMLElement[];
      const live = new Set<HTMLVideoElement>(), alive = new Set<HTMLElement>();
      for (const [index, slot] of slots.entries()) {
        const video = slot.querySelector<HTMLVideoElement>('video'), id = ids[index], primary = id === current.roomId;
        alive.add(slot);
        if (video) {
          live.add(video);
          if (media.get(video)?.id !== id) { media.get(video)?.restore(); media.delete(video); }
          if (!media.has(video)) bindMedia(video, id, primary);
        }
        const existing = labels.get(slot);
        if (existing && (existing.id !== id || !existing.node.isConnected || existing.source && !existing.source.isConnected)) { existing.dispose(); labels.delete(slot); }
        const template = host.querySelector<HTMLElement>('.multi-screen-nick-icon');
        if (!labels.has(slot) && template && (primary || slot.querySelector('.multi-screen-nick-icon'))) labels.set(slot, makeLabel(slot, id, primary, template));
      }
      for (const [video, record] of media) if (!live.has(video)) { record.restore(); media.delete(video); }
      for (const [slot, label] of labels) if (!alive.has(slot)) { label.dispose(); labels.delete(slot); }
      paint();
    } finally { syncing = false; }
  }
  const stop = audio.subscribe(paint), timer = setInterval(sync, 500);
  return {
    apply(options: { enabled: boolean; independentVolume: boolean; centerLabels: boolean }) {
      enabled = options.enabled; centerLabels = options.centerLabels; audio.configure(options.independentVolume); sync();
    },
    dispose() { clearInterval(timer); cancelAnimationFrame(frame); detach(); stop(); style.parentNode?.removeChild(style); },
  };
}
