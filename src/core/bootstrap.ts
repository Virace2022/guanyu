import { GM_registerMenuCommand, GM_unregisterMenuCommand, monkeyWindow, unsafeWindow } from '$';
import { observePlayer } from '../adapters/douyu/player';
import { observePageTheme } from '../adapters/douyu/theme';
import { createSettings } from '../config/settings';
import { createGain } from '../features/volume-gain/controller';
import { createSettingsWindow } from '../ui/settings-window';
import { mountGainControl } from '../ui/gain-control';
import { observeTeam } from '../adapters/douyu/team';
import { mountTeamLayout } from '../adapters/douyu/team-layout';
import { createTeam } from '../features/team-live/controller';
import { createTeamEditor } from '../ui/team-editor';
import { version } from './version';
import { createPageTools } from '../features/page-tools/controller';
import { createBarrage } from '../features/barrage/controller';
import { mountQuickDock } from '../ui/quick-dock';
import { createMultiscreen } from '../features/multiscreen/feature';
import { createMultiWindow } from '../ui/multi-window';
import { mountPlayerMenu, type PlayerAction } from '../adapters/douyu/player-menu';
import { confirmAction } from '../ui/confirm';
import { createPlayerInfo } from '../ui/player-info';
import type { MenuAction } from '../config/player-menu';
import type { OptimizationOptions } from '../config/options';
import { createSign } from '../features/sign/feature';
import { createPlayback } from '../features/playback/controller';
import { createRoomPage } from '../features/room-page/controller';
import { createBackpack } from '../features/backpack/controller';
import { mountTopBanner } from '../adapters/douyu/top-banner';
import { toggleTeamPreview } from '../ui/team-preview';

export function start() {
  const settings = createSettings(localStorage, window), player = observePlayer(unsafeWindow), pageTheme = observePageTheme();
  const gain = createGain(player, settings, localStorage, window), pageTools = createPageTools(settings, unsafeWindow), barrage = createBarrage(settings, unsafeWindow);
  const teamSource = observeTeam(unsafeWindow), team = createTeam(teamSource, localStorage, window, settings);
  const teamEditor = createTeamEditor(team, settings, pageTheme);
  let context: ReturnType<typeof mountPlayerMenu> | undefined;
  let prompt = (_target?: number) => {};
  const multi = createMultiscreen(settings, team, target => prompt(target), item => context?.register('replaceScreen', item));
  const multiWindow = createMultiWindow(multi, settings); prompt = multiWindow.open;
  const openTeam = () => { if (team.value.source) teamEditor.open(); else settingsWindow.open('team'); };
  const sign = createSign(settings, () => player.value.roomId || '', (title, content) => confirmAction(title, content, '前往鱼吧', '继续自动重试'));
  const roomPage = createRoomPage(settings, player);
  const playback = createPlayback(settings, player, () => roomPage.value.roomId === player.value.roomId && roomPage.value.live === true);
  const backpack = createBackpack(settings, player, () => settingsWindow.open('backpack'), message => confirmAction('赠送荧光棒', message, '按计划赠送'));
  const settingsWindow = createSettingsWindow(settings, gain, pageTheme, pageTools, team, multi, sign, backpack, playback, roomPage, openTeam);
  const info = createPlayerInfo(player, settings);
  const removeGainControl = mountGainControl(player, gain, settings);
  const removeTeamLayout = mountTeamLayout(team, openTeam, player);
  const removeTopBanner = mountTopBanner(settings, team);
  const removeQuickDock = mountQuickDock(settings, team, pageTheme, () => settingsWindow.open(), openTeam);
  const menus = [GM_registerMenuCommand('观鱼 · 设置', () => settingsWindow.open()), GM_registerMenuCommand('观鱼 · 团播名单', openTeam), GM_registerMenuCommand('观鱼 · 签到与任务', () => settingsWindow.open('sign'))];
  const toggle = (key: keyof OptimizationOptions) => settings.save({ ...settings.value, optimization: { ...settings.value.optimization, [key]: !settings.value.optimization[key] } });
  const hasTeam = () => !!team.value.source;
  async function preview() {
    await toggleTeamPreview(team, player.value.roomId || '', openTeam);
  }
  const actions: Partial<Record<MenuAction, PlayerAction>> = {
    roomInfo: { label: () => '主播配置信息', submenu: info.submenu, enabled: () => !!player.value.video },
    hideGiftBar: { label: () => settings.value.optimization.hideGiftBar ? '显示礼物栏' : '隐藏礼物栏', run: pageTools.toggleGiftBar },
    collapseChat: { label: () => settings.value.optimization.collapseChat ? '恢复聊天活动区' : '收起聊天活动区', run: pageTools.toggleChat },
    mirror: { label: () => pageTools.value.mirrored ? '还原画面镜像' : '画面镜像', run: pageTools.toggleMirror },
    settings: { label: () => '观鱼设置', run: () => settingsWindow.open() },
    team: { label: () => '团播名单', run: openTeam, enabled: hasTeam },
    preview: { label: () => team.value.preview ? '关闭团播预览' : '开启团播预览', run: preview, enabled: hasTeam },
    refreshTeam: { label: () => '刷新团播开播状态', run: async () => { await team.refreshStatus(); }, enabled: () => hasTeam() && !team.value.refreshing },
    multi: { label: () => multi.value.active ? '编辑官方多屏' : '开启官方多屏', run: multi.open, enabled: () => multi.value.ready && settings.value.multi.enabled },
    hidePk: { label: () => settings.value.optimization.hidePk ? '显示 PK 条' : '隐藏 PK 条', run: () => toggle('hidePk') },
    hideActivities: { label: () => settings.value.optimization.hideActivities ? '显示活动浮窗' : '隐藏活动浮窗', run: () => toggle('hideActivities') },
    hideAds: { label: () => settings.value.optimization.hideAds ? '显示页面广告' : '隐藏页面广告', run: () => toggle('hideAds') },
    gain: { label: () => gain.value.amount > 100 ? '恢复原声' : '开启音量增益', run: gain.toggle, enabled: () => gain.value.available },
    soundSettings: { label: () => '声音设置', run: () => settingsWindow.open('sound') },
    optimizationSettings: { label: () => '优化设置', run: () => settingsWindow.open('optimization') },
    barrageSettings: { label: () => '弹幕设置', run: () => settingsWindow.open('barrage') },
    teamSettings: { label: () => '团播设置', run: () => settingsWindow.open('team') },
    multiSettings: { label: () => '多屏设置', run: () => settingsWindow.open('multi') },
    menuSettings: { label: () => '右键菜单设置', run: () => settingsWindow.open('menu') },
    signSettings: { label: () => '签到与任务', run: () => settingsWindow.open('sign') },
  };
  context = mountPlayerMenu(settings, actions, message => { void confirmAction('操作未完成', message, '知道了'); });
  multi.start();
  console.info('[观鱼] 已启动', { version, sameWindow: monkeyWindow === unsafeWindow });
  function onPageHide(event: PageTransitionEvent) { if (!event.persisted) dispose(); }
  function dispose() {
    for (const menu of menus) GM_unregisterMenuCommand(menu);
    context?.dispose(); multi.dispose(); multiWindow.dispose(); info.dispose(); sign.dispose(); playback.dispose(); roomPage.dispose(); backpack.dispose();
    removeTopBanner();
    removeQuickDock(); barrage.dispose(); pageTools.dispose(); removeTeamLayout(); teamEditor.dispose(); team.dispose(); teamSource.dispose();
    removeGainControl(); settingsWindow.dispose(); gain.dispose(); player.dispose(); pageTheme.dispose(); settings.dispose();
    window.removeEventListener('pagehide', onPageHide);
  }
  window.addEventListener('pagehide', onPageHide);
  return dispose;
}
