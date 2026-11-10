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
import { configureFeatureLogs } from './feature-logs';
import { observeRuntimeLogs } from './runtime-logs';
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
import { mountRoomLayout } from '../adapters/douyu/room-layout';
import { toggleTeamPreview } from '../ui/team-preview';
import { connectTheme } from '../ui/theme';
import { createGlowWindow } from '../ui/glow-window';

export function start() {
  const settings = createSettings(localStorage, window);
  const stopDiagnostics = configureFeatureLogs(settings);
  const player = observePlayer(unsafeWindow), pageTheme = observePageTheme();
  const stopTheme = connectTheme(settings, pageTheme);
  const gain = createGain(player, settings, localStorage, window), pageTools = createPageTools(settings, unsafeWindow), barrage = createBarrage(settings, unsafeWindow);
  const teamSource = observeTeam(unsafeWindow), team = createTeam(teamSource, localStorage, window, settings);
  const teamEditor = createTeamEditor(team, settings, pageTheme);
  let prompt = (_target?: number) => {};
  const multi = createMultiscreen(settings, team, target => prompt(target));
  const multiWindow = createMultiWindow(multi); prompt = multiWindow.open;
  const openTeam = () => { if (team.value.source) teamEditor.open(); else settingsWindow.open('team'); };
  const sign = createSign(settings, () => player.value.roomId || '', (title, content) => confirmAction(title, content, '前往鱼吧', '继续自动重试'));
  const roomPage = createRoomPage(settings, player);
  const playback = createPlayback(settings, player, () => roomPage.value.roomId === player.value.roomId && roomPage.value.live === true);
  let openGlow = () => {};
  const backpack = createBackpack(settings, player, () => settingsWindow.open('backpack'), () => openGlow());
  const glowWindow = createGlowWindow(backpack, settings); openGlow = glowWindow.open;
  const settingsWindow = createSettingsWindow(settings, gain, pageTheme, pageTools, team, multi, sign, backpack, playback, roomPage, openTeam);
  const stopRuntimeLogs = observeRuntimeLogs(team, multi, sign);
  const info = createPlayerInfo(player, settings);
  const removeGainControl = mountGainControl(player, gain, settings);
  const removeTeamLayout = mountTeamLayout(team, openTeam, player);
  const removeTopBanner = mountTopBanner(settings, team);
  const removeRoomLayout = mountRoomLayout(settings, team);
  const removeQuickDock = mountQuickDock(settings, () => settingsWindow.open());
  const menus = [GM_registerMenuCommand('观鱼 · 设置', () => settingsWindow.open()), GM_registerMenuCommand('观鱼 · 团播名单', openTeam), GM_registerMenuCommand('观鱼 · 每日任务', () => settingsWindow.open('sign'))];
  const toggle = (key: keyof OptimizationOptions) => settings.save({ ...settings.value, optimization: { ...settings.value.optimization, [key]: !settings.value.optimization[key] } });
  const hasTeam = () => !!team.value.source;
  async function preview() {
    await toggleTeamPreview(team, player.value.roomId || '', openTeam);
  }
  const actions: Partial<Record<MenuAction, PlayerAction>> = {
    roomInfo: { label: () => '主播配置信息', submenu: info.submenu, enabled: () => !!player.value.video },
    hideGiftBar: { label: () => '隐藏礼物栏', checked: () => settings.value.optimization.hideGiftBar, run: pageTools.toggleGiftBar },
    collapseChat: { label: () => '收起聊天活动区', checked: () => settings.value.optimization.collapseChat, run: pageTools.toggleChat },
    mirror: { label: () => '画面镜像', checked: () => pageTools.value.mirrored, run: pageTools.toggleMirror },
    settings: { label: () => '观鱼设置', run: () => settingsWindow.open() },
    team: { label: () => '团播名单', run: openTeam, enabled: hasTeam },
    preview: { label: () => '团播预览', checked: () => team.value.preview, run: preview, enabled: hasTeam },
    refreshTeam: { label: () => '刷新团播开播状态', run: async () => { await team.refreshStatus(); }, enabled: () => hasTeam() && !team.value.refreshing },
    multi: { label: () => multi.value.active ? '退出多屏' : '进入多屏', run: () => multi.value.active ? multi.exit() : multi.open(), enabled: () => multi.value.ready && settings.value.multi.enabled },
    editMulti: { label: () => '编辑多屏', run: multi.open, enabled: () => multi.value.ready && multi.value.active && settings.value.multi.enabled },
    hidePk: { label: () => '隐藏 PK 条', checked: () => settings.value.optimization.hidePk, run: () => toggle('hidePk') },
    hideActivities: { label: () => '隐藏活动浮窗', checked: () => settings.value.optimization.hideActivities, run: () => toggle('hideActivities') },
    hideAds: { label: () => '隐藏页面广告', checked: () => settings.value.optimization.hideAds, run: () => toggle('hideAds') },
    gain: { label: () => '音量增益', checked: () => gain.value.amount > 100, run: gain.toggle, enabled: () => gain.value.available },
    soundSettings: { label: () => '声音设置', run: () => settingsWindow.open('sound') },
    optimizationSettings: { label: () => '页面整理设置', run: () => settingsWindow.open('optimization') },
    barrageSettings: { label: () => '弹幕与特效设置', run: () => settingsWindow.open('barrage') },
    teamSettings: { label: () => '团播设置', run: () => settingsWindow.open('team') },
    multiSettings: { label: () => '多屏设置', run: () => settingsWindow.open('multi') },
    menuSettings: { label: () => '右键菜单设置', run: () => settingsWindow.open('menu') },
    signSettings: { label: () => '每日任务', run: () => settingsWindow.open('sign') },
  };
  const context = mountPlayerMenu(settings, actions, message => { void confirmAction('操作未完成', message, '知道了'); });
  multi.start();
  console.info('[观鱼][基础] 初始化完成，后续日志随功能运行输出', { sameWindow: monkeyWindow === unsafeWindow });
  function onPageHide(event: PageTransitionEvent) { if (!event.persisted) dispose(); }
  function dispose() {
    stopRuntimeLogs();
    stopDiagnostics();
    for (const menu of menus) GM_unregisterMenuCommand(menu);
    settingsWindow.dispose();
    context.dispose(); multi.dispose(); multiWindow.dispose(); info.dispose(); sign.dispose(); playback.dispose(); roomPage.dispose(); glowWindow.dispose(); backpack.dispose();
    removeTopBanner();
    removeRoomLayout();
    removeQuickDock(); barrage.dispose(); pageTools.dispose(); removeTeamLayout(); teamEditor.dispose(); team.dispose(); teamSource.dispose();
    removeGainControl(); gain.dispose(); player.dispose(); stopTheme(); pageTheme.dispose(); settings.dispose();
    window.removeEventListener('pagehide', onPageHide);
  }
  window.addEventListener('pagehide', onPageHide);
  return dispose;
}
