import type { RoomOptions } from '../../config/enhancements';
import styles from '../../ui/room-page.css?style';

export interface SessionInfo { live: boolean; start: number; now: number; received: number; guild: string }
export function mountRoomPage() {
  const style = styles.cloneNode(true); document.head.append(style);
  const duration = document.createElement('span'), guild = document.createElement('span'), last = document.createElement('span');
  let options: RoomOptions, info: SessionInfo | undefined;
  function sync() {
    if (!style.isConnected) document.head.append(style);
    if (options && document.documentElement.classList.contains('guanyu-hide-unread') !== options.hideUnread) document.documentElement.classList.toggle('guanyu-hide-unread', options.hideUnread);
    const header = document.querySelector('[class*="subTitleContainer__"]');
    const native = header?.querySelector<HTMLElement>('[class*="label__"]');
    for (const node of [duration, guild, last]) if (native) node.className = native.className;
    duration.classList.add('guanyu-room-duration'); guild.classList.add('guanyu-room-guild'); last.classList.add('guanyu-room-last');
    if (options?.duration && info?.live && info.start > 0) {
      const minutes = Math.max(0, Math.floor((info.now + Date.now() - info.received - info.start) / 60000));
      duration.textContent = minutes >= 60 ? `已播${Math.floor(minutes / 60)}小时${minutes % 60}分钟` : `已播${minutes}分钟`;
      duration.title = `本场开播：${new Date(info.start).toLocaleString()}`;
      if (header && duration.parentElement !== header) header.append(duration);
    } else duration.remove();
    if (options?.guild && info?.guild) { guild.textContent = `公会：${info.guild}`; if (header && guild.parentElement !== header) header.append(guild); } else guild.remove();
    if (options?.lastLive && info && !info.live && info.start > 0) { last.textContent = `上次开播：${new Date(info.start).toLocaleString()}`; if (header && last.parentElement !== header) header.append(last); } else last.remove();
    if (options?.closeRecommendation) document.querySelector<HTMLElement>('.ClosingRecommend .dy-ModalRadius-close-x')?.click();
  }
  const timer = setInterval(sync, 1000);
  return {
    apply(value: RoomOptions) { options = value; document.documentElement.classList.toggle('guanyu-hide-unread', value.hideUnread); sync(); },
    update(value?: SessionInfo) { info = value; sync(); },
    dispose() { clearInterval(timer); duration.remove(); guild.remove(); last.remove(); style.parentNode?.removeChild(style); document.documentElement.classList.remove('guanyu-hide-unread'); },
  };
}
