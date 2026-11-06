import type { RoomOptions } from '../../config/enhancements';
import styles from '../../ui/room-page.css?style';
import { createIcon } from '../../ui/icons';
import { bindTheme } from '../../ui/theme';

export interface SessionInfo { live: boolean; start: number; now: number; received: number; guild: string }
export function mountRoomPage() {
  const style = styles.cloneNode(true); document.head.append(style);
  const duration = document.createElement('span'), guild = document.createElement('span');
  const durationText = document.createElement('span'), guildText = document.createElement('span');
  const durationIcon = document.createElement('i'), guildIcon = document.createElement('i');
  durationIcon.append(createIcon('clock')); guildIcon.append(createIcon('guild'));
  duration.append(durationIcon, durationText); guild.append(guildIcon, guildText);
  const last = document.createElement('div'); last.className = 'guanyu-last-live';
  const card = document.createElement('section'); card.className = 'guanyu-last-live-card guanyu-themed'; card.setAttribute('aria-label', '上次开播时间');
  const heading = document.createElement('div'); heading.className = 'guanyu-last-live-title'; heading.append(createIcon('clock'), '上次开播时间');
  const ago = document.createElement('div'); ago.className = 'guanyu-last-live-ago';
  const exact = document.createElement('time'); exact.className = 'guanyu-last-live-exact';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'guanyu-last-live-close'; close.setAttribute('aria-label', '关闭上次开播卡片'); close.append(createIcon('close'));
  card.append(heading, ago, exact, close); last.append(card);
  const theme = bindTheme(card);
  let offlineHost: HTMLElement | null = null, dismissedStart = 0;
  close.onclick = () => { dismissedStart = info?.start ?? 0; last.remove(); };
  let options: RoomOptions, info: SessionInfo | undefined;
  function sync() {
    if (!style.isConnected) document.head.append(style);
    if (options && document.documentElement.classList.contains('guanyu-hide-unread') !== options.hideUnread) document.documentElement.classList.toggle('guanyu-hide-unread', options.hideUnread);
    const header = document.querySelector('[class*="subTitleContainer__"]');
    const native = header?.querySelector<HTMLElement>('[class*="label__"]:not(.guanyu-room-duration):not(.guanyu-room-guild)');
    for (const node of [duration, guild]) if (native) node.className = native.className;
    for (const node of [durationIcon, guildIcon]) node.className = native?.querySelector('i')?.className ?? '';
    duration.classList.add('guanyu-room-duration'); guild.classList.add('guanyu-room-guild');
    if (options?.duration && info?.live && info.start > 0) {
      const minutes = Math.max(0, Math.floor((info.now + Date.now() - info.received - info.start) / 60000));
      durationText.textContent = minutes >= 60 ? `已播${Math.floor(minutes / 60)}小时${minutes % 60}分钟` : `已播${minutes}分钟`;
      duration.title = `本场开播：${new Date(info.start).toLocaleString()}`;
      if (native && duration.previousElementSibling !== native) native.after(duration);
    } else duration.remove();
    if (options?.guild && info?.guild) {
      guildText.textContent = `公会：${info.guild}`;
      const previous = duration.isConnected ? duration : native;
      if (previous && guild.previousElementSibling !== previous) previous.after(guild);
    } else guild.remove();
    const offline = !!options?.lastLive && !!info && !info.live && Number.isFinite(info.start) && info.start > 0;
    const host = offline ? document.querySelector<HTMLElement>('.room-Player') : null;
    if (host !== offlineHost) { offlineHost?.classList.remove('guanyu-offline-info'); offlineHost = host; }
    offlineHost?.classList.add('guanyu-offline-info');
    if (offline && info && host && dismissedStart !== info.start) {
      const minutes = Math.max(0, Math.floor((Date.now() - info.start) / 60000));
      ago.textContent = minutes >= 1440 ? `${Math.floor(minutes / 1440)} 天前` : minutes >= 60 ? `${Math.floor(minutes / 60)} 小时前` : minutes > 0 ? `${minutes} 分钟前` : '刚刚';
      exact.textContent = new Date(info.start).toLocaleString(); exact.dateTime = new Date(info.start).toISOString();
      if (last.parentElement !== host) host.append(last);
    } else last.remove();
    if (options?.closeRecommendation) document.querySelector<HTMLElement>('.ClosingRecommend .dy-ModalRadius-close-x')?.click();
  }
  const timer = setInterval(sync, 1000);
  return {
    apply(value: RoomOptions) { if (!options?.lastLive && value.lastLive) dismissedStart = 0; options = value; document.documentElement.classList.toggle('guanyu-hide-unread', value.hideUnread); sync(); },
    update(value?: SessionInfo) { if (value?.start !== info?.start) dismissedStart = 0; info = value; sync(); },
    dispose() { clearInterval(timer); duration.remove(); guild.remove(); last.remove(); theme.destroy(); offlineHost?.classList.remove('guanyu-offline-info'); style.parentNode?.removeChild(style); document.documentElement.classList.remove('guanyu-hide-unread'); },
  };
}
