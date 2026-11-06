import type { MultiAudio } from '../../features/multiscreen/audio';
import type { MultiQuality } from '../../features/multiscreen/quality';
import type { LabelDisplay } from '../../config/multiscreen';
import type { MultiScreenNative } from './multiscreen';
import type { RoomData } from './rooms';
import { createMultiscreenMenu } from '../../ui/multiscreen-menu';
import styles from '../../ui/multiscreen-audio.css?style';
import labelStyles from '../../ui/multiscreen-labels.css?style';

interface Label {
  id: number; slot: HTMLElement; anchor: HTMLElement; node: HTMLElement; source: HTMLElement | null;
  button: HTMLButtonElement; name: HTMLElement; avatar: HTMLElement; panel: HTMLElement;
  slider: HTMLInputElement; output: HTMLOutputElement; fill: HTMLElement; thumb: HTMLElement;
  offset: { left: number; bottom: number }; reveal: (duration: number) => void; dispose: () => void;
  openMenu: (x: number, y: number, keyboard?: boolean) => void;
}

export function mountMultiscreenLabels(getNative: () => MultiScreenNative, audio: MultiAudio, quality: MultiQuality,
  room: (id: number) => RoomData | undefined, replace: (id: number) => void) {
  const sheets = [styles, labelStyles].map(source => source.cloneNode(true)); sheets.forEach(sheet => document.head.append(sheet));
  const labels = new Map<HTMLElement, Label>(), menu = createMultiscreenMenu(quality, replace);
  let layer: HTMLElement | null = null, container: HTMLElement | null = null;
  let enabled = true, centered = true, display: LabelDisplay = 'always', frame = 0, syncing = false, session = false, hintTimer = 0;
  let hint: HTMLElement | null = null, introduced = false;
  const hintKey = 'guanyu:multi:label-menu-hint:v1';
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  const observer = new MutationObserver(schedule), resize = new ResizeObserver(schedule);

  function makeLabel(slot: HTMLElement, id: number, main: boolean, template: HTMLElement): Label {
    const native = getNative(), source = main ? null : slot.querySelector<HTMLElement>('.multi-screen-nick-icon');
    const face = source ?? template, decoration = getComputedStyle(face);
    const offset = { left: parseFloat(decoration.left) || 10, bottom: parseFloat(decoration.bottom) || 20 };
    const anchor = document.createElement('div'); anchor.className = 'guanyu-label-anchor'; anchor.dataset.guanyuAudioRoom = String(id);
    const hotspot = document.createElement('div'); hotspot.className = 'guanyu-label-hotspot';
    const node = face.cloneNode(false) as HTMLElement; node.classList.remove('guanyu-audio-native-hidden'); node.classList.add('guanyu-audio-label');
    for (const child of [...face.children].slice(0, 2)) node.append(child.cloneNode(true));
    const avatar = node.children[0] as HTMLElement, name = node.children[1] as HTMLElement;
    if (main) name.style.cursor = 'default';
    name.tabIndex = -1; if (!main) { name.setAttribute('role', 'link'); name.tabIndex = 0; }
    source?.classList.add('guanyu-audio-native-hidden');
    const component = main ? null : native.component(slot, (value: any) => !!value.baseStream && typeof value.multiClickHandle === 'function');
    const originalClick = component?.multiClickHandle;
    const replacement = (event: any) => { if (component.state.isLoading) originalClick.call(component, event); };
    if (component && originalClick) {
      // 原生跳转仍按旧坐标命中；仅迁移名字跳转，保留加载失败时的重试操作。
      native.core.d.off('Event_multiClick', originalClick); component.multiClickHandle = replacement; native.core.d.on('Event_multiClick', replacement);
    }
    const navigate = (event: Event) => { event.stopPropagation(); if (originalClick) {
      const rect = slot.getBoundingClientRect(); originalClick.call(component, { curRid: id, x: 11, y: rect.height - 21, width: rect.width, height: rect.height });
    } };
    name.onclick = navigate; name.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); navigate(event); } };
    const button = document.createElement('button'); button.type = 'button'; button.className = 'guanyu-audio-switch'; button.setAttribute('aria-haspopup', 'menu');
    button.onclick = event => { event.stopPropagation(); audio.select(id); };
    const panel = document.createElement('div'); panel.className = 'guanyu-audio-panel'; panel.setAttribute('role', 'dialog');
    const track = document.createElement('div'); track.className = 'guanyu-audio-track';
    const back = document.createElement('div'), fill = document.createElement('div'), thumb = document.createElement('div');
    back.className = 'guanyu-audio-track-back'; fill.className = 'guanyu-audio-track-fill'; thumb.className = 'guanyu-audio-track-thumb';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.setAttribute('aria-orientation', 'vertical');
    const output = document.createElement('output'); track.append(back, fill, thumb, slider); panel.append(track, output); node.append(button, panel);
    anchor.append(hotspot, node); layer!.append(anchor);
    let timer = 0, revealTimer = 0, menuOpen = false, dragging = false, visible = false;
    function show() {
      clearTimeout(timer); visible = true; anchor.dataset.expanded = 'true'; name.tabIndex = main ? -1 : 0;
    }
    function leave() {
      clearTimeout(timer);
      if (menuOpen || dragging || anchor.matches(':hover, :focus-within')) return;
      timer = window.setTimeout(() => {
        visible = false; anchor.dataset.expanded = 'false'; if (display !== 'always') name.tabIndex = -1;
      }, 600);
    }
    const lock = (open: boolean) => { menuOpen = open; node.classList.toggle('guanyu-audio-menu-open', open); if (open) { show(); if (hint) hint.remove(); } else leave(); };
    const openMenu = (x: number, y: number, keyboard = false) => {
      const nativeMenu = native.component(document.querySelector('.menu-da2a9e:not(.subMenu-de1c61)'), (value: any) => typeof value.showMenu === 'function' && typeof value.hideMenu === 'function');
      nativeMenu?.hideMenu({ which: 1, target: button });
      show(); menu.open({ id, name: name.textContent || `房间 ${id}`, main, anchor, slot, lock }, x, y, keyboard);
    };
    anchor.onpointerenter = () => { node.classList.remove('guanyu-audio-dismissed'); show(); }; anchor.onpointerleave = leave;
    button.onpointerenter = () => node.classList.remove('guanyu-audio-dismissed');
    anchor.addEventListener('focusin', show); anchor.addEventListener('focusout', () => queueMicrotask(() => {
      if (!anchor.contains(document.activeElement)) node.classList.remove('guanyu-audio-keyboard');
      leave();
    }));
    anchor.onkeydown = event => {
      event.stopPropagation();
      if (event.target === name && event.key === 'Enter') { event.preventDefault(); navigate(event); }
      else if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); const rect = anchor.getBoundingClientRect(); openMenu(rect.left, rect.bottom, true); }
      else if (event.key === 'Escape') { event.preventDefault(); node.classList.remove('guanyu-audio-keyboard'); node.classList.add('guanyu-audio-dismissed'); button.focus({ preventScroll: true }); }
      else if (audio.value.independent && ['ArrowUp', 'ArrowDown'].includes(event.key) && event.target === button) { event.preventDefault(); node.classList.remove('guanyu-audio-dismissed'); node.classList.add('guanyu-audio-keyboard'); show(); slider.focus({ preventScroll: true }); }
    };
    slider.oninput = () => audio.setLevel(id, Number(slider.value) / 100);
    slider.onpointerdown = event => { dragging = true; slider.setPointerCapture(event.pointerId); show(); };
    const release = () => { dragging = false; leave(); }; slider.onpointerup = release; slider.onpointercancel = release; slider.onlostpointercapture = release;
    const wheel = (event: WheelEvent) => {
      if (!audio.value.independent || event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); event.stopPropagation(); audio.setLevel(id, (audio.value.levels.get(id) ?? 0) + (event.deltaY < 0 ? .05 : -.05));
    };
    button.addEventListener('wheel', wheel, { passive: false }); panel.addEventListener('wheel', wheel, { passive: false });
    const stop = (event: Event) => event.stopPropagation();
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'dblclick', 'click']) anchor.addEventListener(type, stop);
    anchor.dataset.expanded = String(visible);
    return { id, slot, anchor, node, source, name, avatar, button, panel, slider, output, fill, thumb, offset, openMenu,
      reveal(duration) { show(); clearTimeout(revealTimer); revealTimer = window.setTimeout(leave, duration); },
      dispose() {
        clearTimeout(timer); clearTimeout(revealTimer);
        if (component && originalClick && component.multiClickHandle === replacement) {
          native.core.d.off('Event_multiClick', replacement); component.multiClickHandle = originalClick;
          if (component.contDom?.isConnected) native.core.d.on('Event_multiClick', originalClick);
        }
        anchor.remove(); source?.classList.remove('guanyu-audio-native-hidden');
      },
    };
  }

  function paint() {
    if (!layer || !container) return;
    const bounds = layer.getBoundingClientRect(), value = audio.value;
    const controls = document.querySelector<HTMLElement>('#js-player-controlbar > [class*="ControlBar-"]');
    const controlsTop = controls && !controls.classList.contains('is-hidden') ? bounds.bottom - controls.offsetHeight : bounds.bottom;
    const icon = document.querySelector('.volume-07c230 > i');
    for (const label of labels.values()) {
      const rect = label.slot.getBoundingClientRect();
      const left = !centered || rect.left + rect.width / 2 > bounds.left + bounds.width / 2;
      const top = centered && rect.top + rect.height / 2 > bounds.top + bounds.height / 2;
      const corner = `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`;
      label.anchor.dataset.corner = corner; label.node.dataset.guanyuAudioCorner = corner; label.anchor.dataset.display = display;
      label.node.dataset.guanyuAudioMode = value.independent ? 'independent' : 'solo';
      const selected = value.independent ? (value.levels.get(label.id) ?? 0) > 0 : value.selected === label.id;
      const audible = selected && !value.muted && value.master > 0;
      label.node.dataset.guanyuAudioSelected = String(audible);
      const info = room(label.id), name = label.source?.children[1]?.textContent || info?.nn || label.name.textContent || `房间 ${label.id}`;
      if (label.name.textContent !== name) label.name.textContent = name;
      const face = (label.source?.children[0] as HTMLElement | undefined)?.style.backgroundImage || (info?.avt ? `url("${info.avt}")` : '');
      if (face && label.avatar.style.backgroundImage !== face) label.avatar.style.backgroundImage = face;
      const height = label.node.offsetHeight || 29;
      label.anchor.style.left = `${left ? rect.left - bounds.left + (centered ? 10 : label.offset.left) : rect.right - bounds.left - 25 - 10}px`;
      let y = top ? rect.top - bounds.top + 10 : rect.bottom - bounds.top - height - (centered ? 10 : label.offset.bottom);
      if (!centered && y + bounds.top + height > controlsTop) y = controlsTop - bounds.top - height - 8;
      label.anchor.style.top = `${y}px`;
      const action = value.independent ? selected ? '静音' : '恢复声音' : selected && !value.muted ? '静音' : '切换声音到';
      label.button.setAttribute('aria-label', `${action}${name}`); label.button.setAttribute('aria-pressed', String(audible));
      label.button.title = `${name} · ${value.independent ? '悬停调节音量' : '点击切换声音'} · 右键调画质${label.id === getNative().roomId ? '' : ' / 换房'}`;
      const markup = icon?.innerHTML || ''; if (label.button.innerHTML !== markup) label.button.innerHTML = markup;
      label.panel.hidden = !value.independent; label.slider.setAttribute('aria-label', `${name}独立音量`);
      const level = Math.round((value.levels.get(label.id) ?? 0) * 100);
      if (label.slider.value !== String(level)) label.slider.value = String(level);
      label.fill.style.height = `${level}px`; label.thumb.style.bottom = `${12 + level - 5}px`; label.output.value = `${level}%`;
      label.name.tabIndex = label.id !== getNative().roomId && (display === 'always' || label.anchor.dataset.expanded === 'true') ? 0 : -1;
    }
  }
  function detach(end: boolean) {
    observer.disconnect(); resize.disconnect(); menu.close(); clearTimeout(hintTimer); hint?.remove(); hint = null;
    for (const label of labels.values()) label.dispose(); labels.clear();
    menu.node.remove(); layer?.remove(); layer = null; container = null;
    if (end) { session = false; introduced = false; quality.sync([]); }
  }
  function introduce() {
    let seen = false; try { seen = localStorage.getItem(hintKey) === '1'; } catch { /* 存储不可用时只影响提示记忆。 */ }
    const duration = seen ? 1500 : 4000;
    if (!seen) {
      hint = document.createElement('div'); hint.className = 'guanyu-label-hint'; hint.textContent = '右键主播标签，可调画质、换房'; layer!.append(hint);
      try { localStorage.setItem(hintKey, '1'); } catch { /* 首次引导仍可在本页正常显示。 */ }
      hintTimer = window.setTimeout(() => { hint?.remove(); hint = null; }, duration);
    }
    if (!seen || display === 'hover') for (const label of labels.values()) label.reveal(duration);
    introduced = true;
  }
  function sync() {
    frame = 0; if (syncing) return; syncing = true;
    try {
      const native = getNative();
      if (!enabled || !native.service || !native.core || !native.active() || !native.container?.isConnected) { detach(true); return; }
      const ids = native.order(); if (ids.length < 2) { detach(true); return; }
      if (native.service.$dragBox) { menu.close(); return; }
      if (container && (container !== native.container || !layer?.isConnected)) detach(false);
      const editor = document.querySelector<HTMLElement>('[class*="mutiPlayerEditPanel-"]'); if (!editor) return;
      if (!layer) {
        container = native.container; layer = document.createElement('div'); layer.className = 'guanyu-audio-layer';
        const overlay = editor.parentElement!, barrage = overlay.querySelector<HTMLElement>(':scope > [class^="comment-"]');
        overlay.insertBefore(layer, barrage?.nextSibling ?? editor); layer.append(menu.node);
        observer.observe(container!, { subtree: true, childList: true }); resize.observe(container!);
        const bar = document.getElementById('js-player-controlbar'); if (bar) observer.observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
      }
      const slots = [...container!.children].slice(0, ids.length) as HTMLElement[], alive = new Set(slots);
      const template = container!.querySelector<HTMLElement>('.multi-screen-nick-icon');
      for (const [index, slot] of slots.entries()) {
        const id = ids[index], existing = labels.get(slot);
        if (existing && (existing.id !== id || !existing.anchor.isConnected || existing.source && !existing.source.isConnected)) { menu.close(); existing.dispose(); labels.delete(slot); }
        if (!labels.has(slot) && template && (id === native.roomId || slot.querySelector('.multi-screen-nick-icon'))) labels.set(slot, makeLabel(slot, id, id === native.roomId, template));
      }
      for (const [slot, label] of labels) if (!alive.has(slot)) { menu.close(); label.dispose(); labels.delete(slot); }
      quality.sync(ids); paint(); menu.check();
      session = true; if (!introduced && labels.size === ids.length) introduce();
    } finally { syncing = false; }
  }
  const context = (event: MouseEvent) => {
    if (menu.node.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const anchor = (event.target as Element)?.closest<HTMLElement>('.guanyu-label-anchor');
    if (!anchor || !layer?.contains(anchor)) return;
    // window 捕获先于原生 document 菜单监听，避免同一次右键同时打开两份菜单。
    event.preventDefault(); event.stopImmediatePropagation();
    [...labels.values()].find(label => label.anchor === anchor)?.openMenu(event.clientX, event.clientY);
  };
  const keyboard = (event: KeyboardEvent) => {
    const anchor = (event.target as Element)?.closest<HTMLElement>('.guanyu-label-anchor');
    const inMenu = menu.node.contains(event.target as Node);
    if (!inMenu && (!anchor || !layer?.contains(anchor))) return;
    // 原生播放器也监听 keyup；成对隔离，避免菜单的 Escape 同时退出网页全屏。
    event.stopImmediatePropagation();
    if (event.type === 'keyup') { event.preventDefault(); return; }
    if (inMenu) menu.keydown(event); else anchor?.onkeydown?.call(anchor, event);
  };
  window.addEventListener('contextmenu', context, true);
  window.addEventListener('keydown', keyboard, true); window.addEventListener('keyup', keyboard, true);
  const stop = audio.subscribe(paint), timer = setInterval(sync, 500);
  return {
    apply(options: { enabled: boolean; centerLabels: boolean; labelDisplay: LabelDisplay }) {
      const changed = display !== options.labelDisplay; enabled = options.enabled; centered = options.centerLabels; display = options.labelDisplay;
      sync(); if (changed && session) for (const label of labels.values()) label.reveal(1500);
    },
    dispose() { clearInterval(timer); cancelAnimationFrame(frame); detach(true); stop(); menu.dispose(); window.removeEventListener('contextmenu', context, true); window.removeEventListener('keydown', keyboard, true); window.removeEventListener('keyup', keyboard, true); sheets.forEach(sheet => sheet.parentNode?.removeChild(sheet)); },
  };
}
