import type { TeamController } from '../../features/team-live/controller';
import { assignedRooms, layoutRooms, visibleTeams, teamColumns, type CustomRoom } from '../../features/team-live/layout';
import type { TeamRoom, TeamSource } from './team';
import type { PlayerStore } from './player';
import { isPlayerFullscreen } from './player';
import { TeamLiveMonitor } from '../../features/team-live/preview/monitor';
import { toggleTeamPreview } from '../../ui/team-preview';
import styles from '../../ui/team-page.css?style';
import previewStyles from '../../ui/team-preview.css?style';
import { mount as mountComponent, unmount } from 'svelte';
import FishIcon from '../../ui/FishIcon.svelte';
import { bindTheme } from '../../ui/theme';
import { attachEdgeDrag } from '../../ui/edge-drag';
import { mountTeamCardPreview } from './team-card-preview';

export function mountTeamLayout(team: TeamController, openEditor: () => void, player: PlayerStore) {
  const style = styles.cloneNode(true), previewStyle = previewStyles.cloneNode(true);
  document.head.append(style, previewStyle);
  let source: TeamSource | null = null, host: HTMLElement | null = null, outer: HTMLElement | null = null;
  let toolbar: HTMLElement | null = null, view: HTMLElement | null = null, cards: HTMLElement | null = null;
  let controls: { layout: HTMLButtonElement; preview: HTMLButtonElement; members: HTMLButtonElement; refresh: HTMLButtonElement; status: HTMLElement } | null = null;
  let releaseToolbar = () => {};
  const toolbarPosition = { ratio: 0.32 };
  let baseHeight = 0, outerHeight = 0, originalTop = 0, bannerHeight = 0, cardSignature = '', previewSignature = '', membersVisible = false, sourcePreference = '', originalAudio = false;
  let banners: HTMLElement[] = [];
  const painted = new Set<HTMLElement>();
  const nativeWidths = new Map<string, number>();
  let cardHeight = 52;
  const saved = new Map<HTMLElement, string | null>();
  const remember = (node: HTMLElement) => { if (!saved.has(node)) saved.set(node, node.getAttribute('style')); };
  const bridge = {
    get roomId() { return player.value.roomId; },
    get native() { return source?.native; },
    get rooms() { return new Map(layoutRooms(team.value.layout, team.value.source?.rooms ?? [], team.value.statuses).map(room => [room.id, room])); },
    get statuses() { return team.value.statuses; },
    get fullscreen() { return isPlayerFullscreen(); },
    owner: { get layout() {
      const value = team.value;
      const people = value.layout.people.map(person => person.roomId);
      return { ...value.options, enabled: value.grouped, allPreview: value.preview, previewMembers: value.previewMembers, keepEmpty: false,
        previewGroups: [...(people.length ? [{ name: value.layout.peopleTitle, captains: people, members: [], independent: true }] : []), ...visibleTeams(value.layout)] };
    } },
    updateHeight() { reflow(); },
  };
  const monitor = new TeamLiveMonitor(bridge);
  const nativePreview = mountTeamCardPreview(() => source?.native ?? null);
  let liveIcon: HTMLImageElement | undefined;
  let currentRoom = player.value.roomId;
  const stopPlayer = player.subscribe(value => {
    if (currentRoom !== value.roomId) team.setPreview(false);
    currentRoom = value.roomId;
  });
  const resize = new ResizeObserver(() => { arrange(); monitor.arrange(bridge.owner.layout); reflow(); });
  function clearPreview() { const board = monitor.board; monitor.clear(); board?.remove(); previewSignature = ''; }
  function restore() {
    nativePreview.restore();
    resize.disconnect(); clearPreview();
    source?.native.classList.remove('guanyu-team-native-hidden');
    host?.classList.remove('guanyu-team-host-enhanced', 'guanyu-team-narrow');
    for (const banner of banners) banner.classList.remove('guanyu-team-banner-hidden');
    banners = [];
    releaseToolbar(); releaseToolbar = () => {};
    toolbar?.remove(); view?.remove();
    for (const [node, original] of saved) {
      const originalStyle = document.createElement('div').style; originalStyle.cssText = original || '';
      for (const property of ['height', 'width', 'left', 'top', 'margin-left', 'margin-right', 'background-image']) {
        const value = originalStyle.getPropertyValue(property);
        if (value) node.style.setProperty(property, value, originalStyle.getPropertyPriority(property)); else node.style.removeProperty(property);
      }
    }
    for (const node of painted) { node.removeAttribute('data-guanyu-live'); node.querySelector('[data-guanyu-live-icon]')?.remove(); } painted.clear();
    saved.clear(); source = null; host = outer = toolbar = view = cards = null; controls = null; cardSignature = '';
    cardHeight = 52;
    liveIcon = undefined;
  }
  function reflow() {
    if (!host || !outer) return;
    const top = parseFloat(getComputedStyle(host).top) || 0;
    const hiddenBanner = team.value.options.hideBanner ? bannerHeight : 0;
    const height = Math.ceil(outerHeight + host.getBoundingClientRect().height - baseHeight + top - originalTop - hiddenBanner);
    if (height > 0 && outer.style.height !== `${height}px`) outer.style.height = `${height}px`;
  }
  function arrange() {
    if (!view || !host || !cards) return;
    const options = team.value.options;
    host.classList.toggle('guanyu-team-narrow', host.parentElement!.getBoundingClientRect().width > innerWidth);
    if (options.originalWidth) {
      const video = document.getElementById('js-player-video') || document.querySelector('.layout-Player-main');
      const aside = document.getElementById('js-player-asideMain');
      let reference = video?.parentElement;
      while (reference && aside && !reference.contains(aside)) reference = reference.parentElement;
      if (reference === document.body || reference === document.documentElement) reference = null;
      const parent = host.parentElement!.getBoundingClientRect(), rect = reference?.getBoundingClientRect();
      if (rect?.width) {
        const width = Math.min(parent.width, rect.width);
        host.style.width = `${width}px`; host.style.left = `${Math.max(0, Math.min(parent.width - width, rect.left - parent.left))}px`;
        host.style.marginLeft = host.style.marginRight = '0';
      }
    } else {
      const original = saved.get(host);
      const width = original?.match(/(?:^|;)\s*width\s*:\s*([^;]+)/)?.[1];
      if (width) host.style.width = width; else host.style.removeProperty('width');
      const left = original?.match(/(?:^|;)\s*left\s*:\s*([^;]+)/)?.[1];
      if (left) host.style.left = left; else host.style.removeProperty('left');
      for (const property of ['margin-left', 'margin-right']) {
        const savedStyle = document.createElement('div').style; savedStyle.cssText = original || '';
        const margin = savedStyle.getPropertyValue(property);
        if (margin) host.style.setProperty(property, margin); else host.style.removeProperty(property);
      }
    }
    const width = cards.clientWidth || host.clientWidth;
    const columns = teamColumns(visibleTeams(team.value.layout).length, width, options.teamColumns);
    cards.style.setProperty('--guanyu-team-columns', String(columns));
    for (const list of cards.querySelectorAll<HTMLElement>('.guanyu-team-cards')) list.style.setProperty('--guanyu-member-columns', String(Math.max(1, Math.min(options.columns, Math.floor(list.clientWidth / 90) || 1))));
    cards.style.justifyContent = options.alignment;
    view.style.setProperty('--guanyu-team-align', options.alignment);
  }
  function card(room: TeamRoom | CustomRoom | undefined, id: string, name?: string, label?: string) {
    const wrapper = document.createElement('div'); wrapper.className = 'guanyu-team-card'; wrapper.dataset.roomId = id;
    const link = document.createElement('a'); link.className = 'guanyu-team-card-link';
    link.href = room && 'href' in room ? room.href : `https://www.douyu.com/${id}`; link.target = room && 'target' in room ? room.target : '_blank';
    if (link.target === '_blank') link.rel = 'noopener';
    link.setAttribute('aria-label', name || room?.name || `房间 ${id}`); wrapper.append(link);
    if (room) {
      const native = 'element' in room ? room : source!.rooms[0]!;
      const face = native.element.cloneNode(true) as HTMLElement, decoration = getComputedStyle(native.decoration);
      wrapper.style.setProperty('--guanyu-native-card-width', `${nativeWidths.get(native.id) || 130}px`);
      face.removeAttribute('id'); face.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      const text = native.element.querySelector('.room-info-text, .wm-pc-room-button-text');
      if (text) wrapper.style.color = link.style.color = getComputedStyle(text).color;
      face.style.width = face.style.height = '100%'; face.style.boxSizing = 'border-box';
      for (const property of ['border', 'border-radius', 'overflow']) face.style.setProperty(property, decoration.getPropertyValue(property));
      if (name || !('element' in room)) { const text = face.querySelector('.room-info-text, .wm-pc-room-button-text'); if (text) text.textContent = name || room.name; }
      if (!('element' in room)) {
        face.querySelectorAll('img[alt="直播中"], img.room-info-live').forEach(node => node.remove());
        if (room.live && liveIcon) face.append(liveIcon.cloneNode(true));
      }
      link.append(face);
      if ('element' in room) nativePreview.bind(wrapper, link, room);
    } else { link.classList.add('guanyu-team-missing'); link.textContent = name || `房间 ${id} · 来源缺失`; }
    if (label) { const badge = document.createElement('span'); badge.className = 'guanyu-team-label'; badge.textContent = label; wrapper.append(badge); }
    return wrapper;
  }
  function group(title: string, independent = false) {
    const section = document.createElement('section'); section.className = 'guanyu-team-group';
    if (independent) section.classList.add('guanyu-team-independent');
    const heading = document.createElement('h3'); heading.textContent = title;
    const list = document.createElement('div'); list.className = 'guanyu-team-cards'; section.append(heading, list); cards!.append(section); return list;
  }
  async function togglePreview(members = false) {
    await toggleTeamPreview(team, player.value.roomId || '', openEditor, members);
  }
  function mount(next: TeamSource) {
    source = next; host = next.native.parentElement; if (!host) return;
    outer = next.native.closest<HTMLElement>('.wm-general') || host.closest<HTMLElement>('.bc-wrapper');
    remember(host); if (outer) remember(outer);
    baseHeight = host.getBoundingClientRect().height; outerHeight = outer?.getBoundingClientRect().height ?? 0;
    const heights = next.rooms.map(room => room.decoration.getBoundingClientRect().height).filter(height => height > 0);
    if (heights.length) cardHeight = Math.max(...heights);
    const legacy = next.native.closest('.wm-general');
    if (!legacy) {
      const previous = host.previousElementSibling, preceding = outer?.previousElementSibling;
      if (previous instanceof HTMLElement && previous.matches('[id^="bc"]') && previous.querySelector(':scope > .wm-view') && previous.style.backgroundImage) banners.push(previous);
      else if (preceding instanceof HTMLElement && preceding.matches('.wm-general') && preceding.querySelector('.wm-general-wrapper')) banners.push(preceding);
    }
    const innerBanners = banners.filter(node => outer?.contains(node));
    originalTop = parseFloat(getComputedStyle(host).top) || 0;
    bannerHeight = innerBanners.filter(node => !['absolute', 'fixed'].includes(getComputedStyle(node).position)).reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
    toolbar = document.createElement('div'); toolbar.className = 'guanyu-team-toolbar guanyu-themed'; toolbar.setAttribute('aria-label', '团播工具');
    const handle = document.createElement('button'); handle.className = 'guanyu-team-handle'; handle.type = 'button';
    const tools = document.createElement('div'); tools.className = 'guanyu-team-tools'; tools.id = 'guanyu-team-tools';
    handle.setAttribute('aria-controls', tools.id);
    const fish = mountComponent(FishIcon, { target: handle, props: { class: 'guanyu-team-fish' } });
    let returningFocus = false;
    function expand(value: boolean) {
      toolbar!.dataset.expanded = String(value); tools.inert = !value;
      handle.setAttribute('aria-expanded', String(value));
      handle.setAttribute('aria-label', value ? '收起团播工具' : '展开团播工具');
      handle.title = `悬停展开团播工具，点击${value ? '收起' : '展开'}；按住上下拖动`;
    }
    expand(false);
    handle.onclick = () => expand(toolbar!.dataset.expanded !== 'true');
    const drawer = document.createElement('div'); drawer.className = 'guanyu-team-drawer';
    drawer.append(handle, tools); toolbar.append(drawer);
    toolbar.onpointerenter = event => { if (event.pointerType === 'mouse') expand(true); };
    toolbar.onpointerleave = () => {
      if (!toolbar!.dataset.dragging && !toolbar!.querySelector(':focus-visible')) expand(false);
    };
    toolbar.addEventListener('focusin', () => { if (!returningFocus) expand(true); });
    toolbar.addEventListener('focusout', event => {
      if (!toolbar!.contains(event.relatedTarget as Node | null) && !toolbar!.matches(':hover')) expand(false);
    });
    toolbar.onkeydown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); expand(false);
      returningFocus = true; handle.focus({ preventScroll: true }); returningFocus = false;
    };
    const button = (label: string, run: () => void) => { const node = document.createElement('button'); node.textContent = label; node.onclick = run; tools.append(node); return node; };
    button('名单', openEditor);
    const layout = button('分组', () => team.setGrouped(!team.value.grouped));
    const preview = button('预览', () => { void togglePreview(); });
    const members = button('队员', () => { void togglePreview(true); });
    const refresh = button('刷新', () => { void team.refreshStatus(); });
    button('排除此活动', () => team.setDetection('exclude'));
    const status = document.createElement('span'); tools.append(status); controls = { layout, preview, members, refresh, status };
    // 工具条独立浮动，绝不插入活动的绝对定位卡片容器。
    toolbar.hidden = bridge.fullscreen || !team.value.options.showToolbar;
    document.body.append(toolbar);
    const toolbarTheme = bindTheme(toolbar);
    view = document.createElement('div'); view.className = 'guanyu-team-view guanyu-themed';
    const viewTheme = bindTheme(view);
    const stopDrag = attachEdgeDrag(handle, toolbar, toolbarPosition);
    releaseToolbar = () => { stopDrag(); toolbarTheme.destroy(); viewTheme.destroy(); void unmount(fish); };
    view.style.setProperty('--guanyu-card-height', `${cardHeight}px`);
    cards = document.createElement('div'); cards.className = 'guanyu-team-groups'; view.append(cards); next.native.after(view);
    resize.observe(host); resize.observe(view);
  }
  const stop = team.subscribe(value => {
    const next = value.source;
    if (next?.native !== source?.native) { restore(); if (next) mount(next); }
    if (!next || !source || !host || !view || !cards || !controls) return;
    source = next;
    const nativeText = source.rooms[0]?.element.querySelector('.room-info-text, .wm-pc-room-button-text');
    if (nativeText) view.style.setProperty('--guanyu-team-native-ink', getComputedStyle(nativeText).color);
    if (!view.isConnected) source.native.after(view);
    if (!toolbar!.isConnected) document.body.append(toolbar!);
    toolbar!.hidden = bridge.fullscreen || !value.options.showToolbar;
    controls.layout.textContent = value.grouped ? '原始布局' : '分组布局';
    controls.preview.textContent = value.preview ? '关闭预览' : '开启预览';
    controls.members.hidden = !value.grouped || !value.preview;
    controls.members.textContent = value.previewMembers ? '收起队员' : '展开队员';
    controls.refresh.disabled = value.refreshing;
    controls.status.textContent = value.statusError || (value.refreshing ? '刷新中…' : value.lastRefresh ? `更新于 ${new Date(value.lastRefresh).toLocaleTimeString()}` : `${source.rooms.length} 人`);
    host.classList.toggle('guanyu-team-host-enhanced', value.grouped || value.preview);
    const originalIcon = source.rooms.map(room => room.element.querySelector<HTMLImageElement>('img[alt="直播中"], img.room-info-live')).find(Boolean);
    if (originalIcon) liveIcon = originalIcon.cloneNode(true) as HTMLImageElement;
    if (!liveIcon && source.liveIcon?.icon) {
      liveIcon = document.createElement('img'); liveIcon.src = source.liveIcon.icon; liveIcon.alt = '直播中';
      if (source.native.matches('.room-info')) liveIcon.className = 'room-info-live';
      Object.assign(liveIcon.style, { position: 'absolute', top: source.liveIcon.top || '0px', right: source.liveIcon.right || '0px' });
    }
    if (value.lastRefresh) for (const room of source.rooms) {
      painted.add(room.element); room.element.dataset.guanyuLive = String(room.live);
      if (room.live && liveIcon && !room.element.querySelector('img[alt="直播中"], img.room-info-live')) {
        const icon = liveIcon.cloneNode(true) as HTMLImageElement; icon.dataset.guanyuLiveIcon = ''; room.element.append(icon);
      }
    }
    for (const room of source.rooms) { const width = room.decoration.getBoundingClientRect().width; if (width > 0) nativeWidths.set(room.id, width); }
    source.native.classList.toggle('guanyu-team-native-hidden', value.grouped);
    cards.hidden = !value.grouped; view.hidden = !value.grouped && !value.preview;
    if (outer) {
      for (const banner of banners) banner.classList.toggle('guanyu-team-banner-hidden', value.options.hideBanner);
      for (const node of [outer, ...outer.querySelectorAll<HTMLElement>(':scope > .wm-general-wrapper, :scope > .wm-general-bgblur')]) {
        remember(node);
        if (value.options.hideBanner) node.style.backgroundImage = 'none';
        else {
          const original = saved.get(node)?.match(/(?:^|;)\s*background-image\s*:\s*([^;]+)/)?.[1];
          if (original) node.style.backgroundImage = original; else node.style.removeProperty('background-image');
        }
      }
      if (value.options.hideBanner) {
        host.style.top = '0px';
      }
      else { const top = saved.get(host)?.match(/(?:^|;)\s*top\s*:\s*([^;]+)/)?.[1]; if (top) host.style.top = top; else host.style.removeProperty('top'); }
    }
    const available = layoutRooms(value.layout, source.rooms, value.statuses);
    const signature = JSON.stringify([value.grouped, value.layout, available.map(room => [room.id, room.name, room.avatar, room.live])]);
    if (signature !== cardSignature) {
      nativePreview.restore();
      cardSignature = signature; cards.replaceChildren();
      if (value.grouped) {
        const rooms = new Map(available.map(room => [room.id, room]));
        if (value.layout.people.length) { const list = group(value.layout.peopleTitle, true); for (const person of value.layout.people) list.append(card(rooms.get(person.roomId), person.roomId, person.name, person.label)); }
        for (const item of visibleTeams(value.layout)) {
          const section = group(item.name).parentElement!;
          const captains = section.querySelector<HTMLElement>('.guanyu-team-cards')!; captains.classList.add('guanyu-team-captains'); captains.setAttribute('aria-label', `${item.name}队长`);
          for (const id of item.captains) captains.append(card(rooms.get(id), id, undefined, '队长'));
          const members = document.createElement('div'); members.className = 'guanyu-team-cards guanyu-team-members'; members.setAttribute('aria-label', `${item.name}队员`);
          for (const id of item.members) members.append(card(rooms.get(id), id));
          section.append(members);
        }
        const assigned = assignedRooms(value.layout), remaining = available.filter(room => !assigned.has(room.id));
        if (remaining.length) { const list = group('待分配成员', true); for (const room of remaining) list.append(card(room, room.id)); }
      }
    }
    const mediaSignature = JSON.stringify([source.activity, value.grouped, value.layout, source.rooms.map(room => room.id)]);
    if (!value.preview) clearPreview();
    else if (mediaSignature !== previewSignature) { clearPreview(); monitor.mount(view, bridge.owner.layout); previewSignature = mediaSignature; membersVisible = value.previewMembers; }
    else if (membersVisible !== value.previewMembers) { monitor.updateMembers(bridge.owner.layout); membersVisible = value.previewMembers; }
    if (sourcePreference && sourcePreference !== value.options.previewSource) for (const tile of monitor.tiles) monitor.restart(tile);
    if (originalAudio !== value.options.previewFocusOriginal) monitor.focus.restoreAll();
    originalAudio = value.options.previewFocusOriginal;
    sourcePreference = value.options.previewSource;
    arrange(); monitor.arrange(bridge.owner.layout); monitor.sync(); reflow();
  });
  const fullscreen = () => { if (toolbar) toolbar.hidden = bridge.fullscreen || !team.value.options.showToolbar; if (bridge.fullscreen) { nativePreview.restore(); monitor.focus.restoreAll(); } monitor.sync(); };
  document.addEventListener('fullscreenchange', fullscreen);
  const fullscreenObserver = new MutationObserver(fullscreen);
  fullscreenObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const fullscreenTimer = setInterval(fullscreen, 1000);
  return () => { stop(); stopPlayer(); clearInterval(fullscreenTimer); fullscreenObserver.disconnect(); document.removeEventListener('fullscreenchange', fullscreen); restore(); nativePreview.dispose(); monitor.dispose(); style.parentNode?.removeChild(style); previewStyle.parentNode?.removeChild(previewStyle); };
}
