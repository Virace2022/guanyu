import type { SettingsStore } from '../config/settings';
import { nativeShieldChoices } from '../config/options';
import { signTasks } from '../config/sign';
import { diagnostics } from './diagnostics';

export function configureFeatureLogs(settings: SettingsStore) {
  function sync() {
    const saved = settings.value, preview = settings.runtime.value;
    const room = location.pathname !== '/member/cp/getFansBadgeList';
    diagnostics.enable('theme', '通用', '外观主题');
    function options<T extends object>(prefix: string, category: string, names: Record<string, string>, values: T, applicable = room) {
      for (const [key, name] of Object.entries(names)) diagnostics.enable(`${prefix}.${key}`, category, name, applicable && !!values[key as keyof T]);
    }
    for (const [id, category, name] of [
      ['player', '基础', '官方播放器'], ['dock', '通用', '小鱼设置入口'], ['gain.control', '声音', '增益控件'], ['gain.audio', '声音', '音量增益'],
      ['team.detect', '团播', '名单识别'], ['team.layout', '团播', '名单布局'], ['team.preview', '团播', '成员预览'],
      ['team.hoverPreview', '团播', '原生悬停预览'],
    ]) diagnostics.enable(id!, category!, name!, room);
    diagnostics.enable('room.api', '房间信息', '房间资料接口', room && (saved.playback.autoWebFullscreen || saved.room.duration || saved.room.guild || saved.room.lastLive));
    diagnostics.enable('backpack.api', '背包与权益', '资料接口', room && Object.entries(saved.backpack).some(([key, value]) => key !== 'glowCount' && !!value));
    options('optimization', '页面整理', { hideAds: '隐藏页面广告', hideTopBanner: '隐藏顶图', hideRoomExtras: '隐藏下方内容', hideGiftBar: '隐藏礼物栏', hidePk: '隐藏 PK 条', hideActivities: '隐藏活动浮窗', collapseChat: '收起聊天活动区', autoHideHeader: '顶栏自动显隐' }, preview.optimization);
    options('barrage', '弹幕与特效', { fans: '隐藏粉丝牌', diamond: '隐藏钻粉后缀', noble: '隐藏贵族标记', level: '隐藏等级', other: '隐藏其他标记', suffix: '隐藏弹幕后缀', enter: '隐藏进场提示' }, preview.barrage);
    diagnostics.enable('barrage.linked', '弹幕与特效', '过滤活动及链接消息', room && saved.barrage.linked);
    options('shield', '弹幕与特效', Object.fromEntries(nativeShieldChoices.map(item => [item.key, item.label])), preview.nativeShield);
    options('playback', '播放', { autoWebFullscreen: '自动网页全屏', highestQuality: '自动最高画质', volumeWheel: '滚轮音量', keepBackgroundVideo: '后台保持视频流' }, saved.playback);
    options('room', '房间信息', { duration: '开播时长', guild: '公会资料', lastLive: '上次开播' }, saved.room);
    options('room', '页面整理', { closeRecommendation: '关闭下播推荐', hideUnread: '隐藏未读提示' }, saved.room);
    options('backpack', '背包与权益', { details: '道具到期与价值', monthCost: '月消费', vipExpiry: 'VIP 到期', pocket: '主播口袋', glow: '荧光棒续牌' }, saved.backpack);
    diagnostics.enable('backpack.badgeDays', '背包与权益', '粉丝牌天数', saved.backpack.badgeDays);
    diagnostics.enable('backpack.chatBadgeDays', '背包与权益', '聊天区牌龄', saved.backpack.chatBadgeDays);
    diagnostics.enable('multi.service', '多屏', '官方多屏服务', room && saved.multi.enabled);
    options('multi', '多屏', { useFollow: '关注候选', compact: '紧凑选房', independentVolume: '独立音量', centerLabels: '集中标签' }, saved.multi, room && saved.multi.enabled);
    diagnostics.enable('multi.labels', '多屏', '主播标签', room && saved.multi.enabled);
    diagnostics.enable('multi.quality', '多屏', '逐路画质', room && saved.multi.enabled);
    options('team', '团播', { showToolbar: '团播工具条', autoRefresh: '刷新开播状态' }, preview.team);
    diagnostics.enable('menu', '右键菜单', '播放器菜单', room && saved.playerMenu.length > 0);
    diagnostics.enable('menu.roomInfo', '右键菜单', '主播配置信息', room && saved.playerMenu.includes('roomInfo'));
    diagnostics.enable('sign', '每日任务', '任务调度', saved.sign.enabled);
    for (const task of signTasks) diagnostics.enable(`sign.${task.id}`, '每日任务', task.label, saved.sign.enabled && saved.sign[task.id]);
    diagnostics.enable('sign.clientRemedy', '每日任务', '客户端自动补签', saved.sign.enabled && saved.sign.client && saved.sign.clientRemedy);
  }
  const stopPreview = settings.runtime.subscribe(sync), stopSaved = settings.subscribe(sync);
  return () => { stopPreview(); stopSaved(); diagnostics.stop(); };
}
