import type { BarrageOptions } from '../../config/options';
import { diagnostics } from '../../core/diagnostics';
import { reportMatches } from './diagnostics';

const markSelectors: Record<Exclude<keyof BarrageOptions, 'linked' | 'enter'>, string[]> = {
  fans: ['.FansMedal', '.FansMedalWrap:not(:has(dy-fan-medal))'],
  diamond: [],
  noble: ['.Barrage-noble', '.Barrage-nobleImg', 'picture:has(.SupremeRightIconJSX)', '.SupremeRightIconJSX', '.Barrage-supremeName--prefix', '.Barrage-supremeName--suffix'],
  level: ['.UserLevel', '.AnchorLevel', '.RoomLevel'],
  other: ['.Barrage-icon:not(.Barrage-noble)', '.Barrage-honor', '.AdminVest', '.Motor', '.EnterRideIcon', '.ChatAchievement', '.Barrage-hiIcon', '.Medal', '.MatchSystemTeamMedal', '.TeamFansMedalJSX', '.Baby', '.UserGameDataMedal', '.UserCsgoGameDataMedal', '.CPMedal', '.Barrage-roomVipIcon', '.Barrage-backgroundIcon'],
  suffix: ['.Barrage-content.is-suffix', '.js-barrage-suffix', '.Barrage-content.js-open-diamondfans-panel', '.Barrage-devideAdIcon', '.Barrage-devideAdText'],
};

const medalStyle = `
:host([data-guanyu-hide-diamond]), :host([data-guanyu-hide-fans]) { width: auto !important; min-width: 0 !important; }
:host([data-guanyu-hide-fans]) :is(.backdrop, .name, .prefix, .level),
:host([data-guanyu-hide-diamond]) :is(.suffix, .suffix-month) { display: none !important; }
:host([data-guanyu-hide-diamond]) .container.has-suffix { width: var(--container-width) !important; padding-right: 0 !important; }
:host([data-guanyu-hide-diamond]) .container.has-suffix .name { right: var(--container-gap-right) !important; }
:host([data-guanyu-hide-diamond]) .container.super-fans.has-suffix { width: var(--super-fans-container-width) !important; }
:host([data-guanyu-hide-diamond]) .container.super-fans.has-suffix .backdrop { width: 100% !important; }
:host([data-guanyu-hide-fans]) .container { width: var(--suffix-width) !important; padding-right: 0 !important; }
:host([data-guanyu-hide-fans]):not([data-hassuffix="true"]), :host([data-guanyu-hide-fans][data-guanyu-hide-diamond]) { display: none !important; }
`;

interface NativeMessage extends Record<string, unknown> {
  txt?: string;
  bizType?: string;
  commChatMsg?: { btype?: string };
  commChatMsgContent?: unknown;
}
type CommentFilter = (this: NativePlayer, message: NativeMessage) => unknown;
interface NativePlayer { commentFilter?: CommentFilter }
interface NativeChannel { subscriber?: unknown; next(message: unknown): void }
interface Subscription { unsubscribe(): void }
interface Observable { subscribe(observer: { next(value: unknown): void; error(): void }): Subscription }
interface DouyuBarragePage extends Window {
  __player?: NativePlayer;
  __SHARK_INJECTABLE_CHANNEL__?: Record<string, NativeChannel>;
}

export function mountBarrage(page: DouyuBarragePage) {
  const style = document.createElement('style'); document.head.append(style);
  let options: BarrageOptions;
  let released = false;
  let container: Element | null = null;
  let active: { player: NativePlayer; original?: CommentFilter; wrapper: CommentFilter } | null = null;
  let templates: unknown = null, roomConfig: unknown = null, lastAttempt = 0;
  const subscriptions = new Set<Subscription>();
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches('dy-fan-medal')) syncMedal(node as HTMLElement);
      node.querySelectorAll<HTMLElement>('dy-fan-medal').forEach(syncMedal);
    }
  });

  function syncMedal(medal: HTMLElement & { updateComplete?: Promise<unknown> }) {
    if (released || !medal.closest('.Barrage-listItem') || !options) return;
    medal.setAttribute('data-guanyu-medal', '');
    medal.toggleAttribute('data-guanyu-hide-fans', options.fans);
    medal.toggleAttribute('data-guanyu-hide-diamond', options.diamond);
    Promise.resolve(medal.updateComplete).then(() => {
      if (released || !medal.isConnected || !medal.shadowRoot || medal.shadowRoot.querySelector('#guanyu-medal-style')) return;
      const sheet = document.createElement('style'); sheet.id = 'guanyu-medal-style'; sheet.textContent = medalStyle;
      medal.shadowRoot.append(sheet);
    });
  }

  function callNative(service: string, method: string, args: unknown[], receive: (value: unknown) => void) {
    const channel = page.__SHARK_INJECTABLE_CHANNEL__?.[service];
    if (typeof channel?.subscriber !== 'function') return false;
    try { channel.next({ method, args, subscriber: { next: receive, complete() {} } }); return true; }
    catch (cause) { diagnostics.report('barrage.linked', 'error', `${service}.${method} 调用失败：${String(cause)}`, '官方配置'); return false; }
  }

  function loadConfig() {
    if ((templates && roomConfig) || Date.now() - lastAttempt < 30_000) return;
    if (typeof page.__SHARK_INJECTABLE_CHANNEL__?.['live.playerAsideModule.NormalServices']?.subscriber !== 'function') return;
    lastAttempt = Date.now();
    const read = (service: string, method: string, receive: (value: unknown) => void) => callNative(service, method, [], value => {
      const observable = value as Observable | null;
      if (typeof observable?.subscribe !== 'function') return;
      const subscription = observable.subscribe({ next: receive, error() {} });
      if (typeof subscription?.unsubscribe === 'function') subscriptions.add(subscription);
    });
    if (!templates) read('live.playerAsideModule.NormalServices', 'getCommChatmsgConfig', value => { templates = value; });
    if (!roomConfig) read('live.common.userPropCommonServices', 'getCommonRoomConfig', value => { roomConfig = value; });
  }

  function hasLink(message: NativeMessage) {
    if (!message || typeof message !== 'object') return false;
    if (/(?:https?:\/\/|www\.)[^\s<>"']+/i.test(message.txt ?? '')) return true;
    const service = 'live.playerAsideModule.NormalServices';
    let content = message.commChatMsgContent;
    if (templates && (message.gadid || message.bizType === 'comm_chatmsg')) {
      // 复用官方模板解析，避免把普通正文或粉丝牌链接当作活动链接。
      callNative(service, 'handleCommChatmsg', [message, templates], value => { content = value; });
    }
    if (Array.isArray(content) && content.some(part => part && [2, 3].includes(Number(part.sType))
      && part.link && (Number(part.vType) === 2 ? message.txt : part.value))) return true;
    if (message.adid && roomConfig) {
      let suffix: { text?: string; rnType?: unknown } | undefined;
      callNative(service, 'getBarrageSuffix', [message, roomConfig], value => { suffix = value as typeof suffix; });
      if (suffix?.text && suffix.rnType) return true;
    }
    return message.bizType === 'comm_chatmsg' && message.commChatMsg?.btype === 'dfans_cate_act';
  }

  function restoreFilter() {
    if (active?.player.commentFilter === active?.wrapper && active) active.player.commentFilter = active.original;
    active = null;
  }

  function refresh() {
    const next = document.getElementById('js-barrage-container');
    if (next !== container) {
      observer.disconnect(); container = next;
      if (next) { observer.observe(next, { childList: true, subtree: true }); next.querySelectorAll<HTMLElement>('dy-fan-medal').forEach(syncMedal); }
    }
    if (options) {
      for (const key of Object.keys(markSelectors) as (keyof typeof markSelectors)[]) if (options[key]) {
        const selectors = [...markSelectors[key], ...(['fans', 'diamond'].includes(key) ? ['dy-fan-medal'] : [])].map(selector => `.Barrage-listItem ${selector}`).join(', ');
        reportMatches(`barrage.${key}`, selectors, '规则已准备，当前无对应弹幕标记，继续观察');
      }
      if (options.enter) reportMatches('barrage.enter', '#js-barrage-extend-container, .Barrage-listItem .Barrage-userEnter', '规则已准备，当前无进场提示节点，继续观察');
    }
    if (!options?.linked) { restoreFilter(); return; }
    loadConfig();
    const player = page.__player;
    if (!player || typeof player !== 'object') { diagnostics.report('barrage.linked', 'unmatched', '未找到页面 __player，commentFilter 尚未接入', '过滤器'); restoreFilter(); return; }
    diagnostics.report('barrage.linked', templates && roomConfig ? 'ready' : 'waiting', templates && roomConfig ? '已取得官方活动模板和房间配置' : `等待官方配置：${!templates ? 'NormalServices.getCommChatmsgConfig ' : ''}${!roomConfig ? 'userPropCommonServices.getCommonRoomConfig' : ''}；普通文本链接过滤不受影响`, '官方配置');
    diagnostics.report('barrage.linked', 'applied', '已接入 __player.commentFilter，整条消息在原生转发前过滤', '过滤器');
    if (active?.player === player && player.commentFilter === active.wrapper) return;
    restoreFilter();
    const original = player.commentFilter;
    const wrapper: CommentFilter = function(message) {
      // 原函数还会转发飘屏，整条过滤必须先于原生转发，队列节点由官方管理。
      if (!released && options.linked && hasLink(message)) return true;
      return typeof original === 'function' ? original.call(this, message) : false;
    };
    active = { player, original, wrapper }; player.commentFilter = wrapper;
  }

  const timer = setInterval(refresh, 1000);
  void page.customElements?.whenDefined('dy-fan-medal').then(() => { if (!released) document.querySelectorAll<HTMLElement>('.Barrage-listItem dy-fan-medal').forEach(syncMedal); });
  return {
    apply(value: BarrageOptions) {
      options = value;
      const selectors = (Object.keys(markSelectors) as (keyof typeof markSelectors)[])
        .filter(key => value[key]).flatMap(key => markSelectors[key].map(selector => `.Barrage-listItem ${selector}`));
      selectors.push('.Barrage-listItem .FansMedalWrap:has(> dy-fan-medal[data-guanyu-hide-fans]:is([data-guanyu-hide-diamond], :not([data-hassuffix="true"])))');
      if (value.enter) selectors.push('#js-barrage-extend-container', '.Barrage-listItem:has(.Barrage-userEnter)');
      if (value.linked) selectors.push('.Barrage-listItem:has(.Barrage-content.js-barrage-activity-link, .Barrage-content.is-link, .Barrage-content a[href], .Barrage-content.js-open-diamondfans-panel, .Barrage-content.js-barrage-suffix[data-btype]:not([data-btype=""]), .Barrage-devideAdIcon.is-link[data-url]:not([data-url=""]), .Barrage-devideAdText.is-link[data-url]:not([data-url=""]))');
      style.textContent = `${selectors.join(',')}{display:none !important;}`;
      document.querySelectorAll<HTMLElement>('.Barrage-listItem dy-fan-medal').forEach(syncMedal);
      refresh();
    },
    dispose() {
      released = true; clearInterval(timer); observer.disconnect(); restoreFilter();
      for (const subscription of subscriptions) subscription.unsubscribe();
      document.querySelectorAll<HTMLElement>('dy-fan-medal[data-guanyu-medal]').forEach(medal => {
        medal.shadowRoot?.querySelector('#guanyu-medal-style')?.remove();
        for (const attribute of ['data-guanyu-medal', 'data-guanyu-hide-fans', 'data-guanyu-hide-diamond']) medal.removeAttribute(attribute);
      });
      style.remove();
    },
  };
}
