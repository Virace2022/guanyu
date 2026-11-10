import { nativeShieldChoices } from '../config/options';
import { menuActions } from '../config/player-menu';
import { signTasks, clientRemedyChoice } from '../config/sign';
import { activityChoices, backpackChoices, barrageMarks, layoutChoices, playbackChoices, reminderChoices, roomChoices } from './settings-options';
import { settingsSections, type SettingsSection } from './settings-types';

export interface SettingResult {
  id: string;
  section: SettingsSection;
  group: string;
  title: string;
  description: string;
  path: string;
  selector: string;
}

export interface SettingGroup {
  id: string;
  path: string;
  items: SettingResult[];
}

function item(section: SettingsSection, group: string, title: string, description: string, selector: string): SettingResult {
  const label = settingsSections.find(value => value.id === section)!.label;
  return { id: `${section}:${selector}`, section, group, title, description, path: group ? `${label} → ${group}` : label, selector };
}

function options(section: SettingsSection, group: string, prefix: string, values: { key: string; label: string; hint?: string }[]) {
  return values.map(value => item(section, group, value.label, value.hint ?? '', `[data-setting="${prefix}.${value.key}"]`));
}

const catalog: SettingResult[] = [
  ...options('playback', '播放偏好', 'playback', playbackChoices),
  item('sound', '当前房间', '当前房间额外增益', '提高当前主房间的声音响度，按房间记忆，可随时恢复原声。', '.room-section'),
  item('sound', '常用档位', '常用增益档位', '添加、移除或恢复默认档位，最多八个额外增益百分比。', '.preset-settings'),
  item('sound', '增益上限', '额外倍率上限', '设置 1.0～5.0 倍额外增益上限。', '#guanyu-limit'),
  ...options('optimization', '页面布局', 'optimization', layoutChoices),
  ...options('optimization', '广告与活动', 'optimization', activityChoices),
  ...options('optimization', '弹窗与提醒', 'room', reminderChoices),
  ...options('barrage', '标记与装饰', 'barrage', barrageMarks),
  item('barrage', '消息过滤', '隐藏进场提示', '隐藏聊天区底部“谁谁谁来了”的文字提示，进场动画由特效屏蔽控制。', '[data-setting="barrage.enter"]'),
  item('barrage', '消息过滤', '隐藏活动 / 带链接的弹幕', '整条活动或链接消息不显示，粉丝牌链接不在此范围内。', '[data-setting="barrage.linked"]'),
  ...options('barrage', '原生特效屏蔽', 'shield', nativeShieldChoices),
  item('team', '当前活动', '活动识别与团播名单', '自动识别活动、作为团播使用或排除，编辑名单、刷新开播状态、开启静音预览。', 'section:first-of-type > h2'),
  item('team', '布局与入口', '显示右侧团播工具条', '点击小鱼展开，沿右侧上下拖动，隐藏后仍可从设置打开名单。', '[data-setting="team.showToolbar"]'),
  item('team', '布局与入口', '队伍列数', '自动适应或指定队伍排列的列数。', '#team-columns'),
  item('team', '布局与入口', '队员卡片布局', '按人数自动编排、保留原卡片尺寸或固定队员列数。', '#team-member-layout'),
  item('team', '布局与入口', '排列对齐', '团播分组靠左、居中或靠右排列。', '#team-alignment'),
  item('team', '布局与入口', '跟随播放器与聊天区宽度', '让团播名单与播放器、聊天区整体等宽。', '[data-setting="team.originalWidth"]'),
  item('team', '状态刷新与预览', '自动刷新开播状态', '按设定间隔更新成员是否开播，保留已编排的分组与成员。', '[data-setting="team.autoRefresh"]'),
  item('team', '状态刷新与预览', '刷新间隔', '自动刷新成员开播状态的间隔时间。', '#team-refresh'),
  item('team', '状态刷新与预览', '预览来源', '优先最低画质，失败回退原生；也可选择原生预览。', '#preview-source'),
  item('team', '状态刷新与预览', '失败自动重试', '预览失败后的重试间隔，也可关闭自动重试。', '#preview-retry'),
  item('team', '状态刷新与预览', '放大时切换高清原声', '放大后获取高清画面并开启声音；获取失败时继续静音预览，还原后立即静音。', '[data-setting="team.previewFocusOriginal"]'),
  item('multi', '当前页面', '开启官方多屏增强', '提供选房和多屏设置；选择房间后播放，普通直播间最多四屏，包含当前房间。', '[data-setting="multi.enabled"]'),
  item('multi', '声音模式', '独立控制各直播间音量', '各画面分别静音和调节音量，底部音量作为总比例；关闭后只听一路。', '[data-setting="multi.independentVolume"]'),
  item('multi', '主播标签', '主播标签显示方式', '始终显示、仅显示头像、全部隐藏；悬停时展开名字或显示标签。', '.label-display-options'),
  item('multi', '主播标签', '标签集中到画面中间', '头像和音量入口贴近画面中间，名字向外排列；关闭后位于左下角。', '[data-setting="multi.centerLabels"]'),
  item('multi', '选房与候选', '使用关注名单', '在普通直播间中，把已关注的主播加入选房候选。', '[data-setting="multi.useFollow"]'),
  item('multi', '选房与候选', '紧凑选房', '两行 16:9 缩略图，面板内部纵向滚动，关闭恢复原生大图。', '[data-setting="multi.compact"]'),
  item('multi', '常用候选', '添加常用候选房间', '输入房间号或斗鱼直播间链接，添加后不会自动播放。', '#multi-custom-room'),
  ...options('room', '主播与直播资料', 'room', roomChoices),
  ...options('backpack', '道具与消费', 'backpack', backpackChoices.filter(value => ['details', 'monthCost'].includes(value.key))),
  ...options('backpack', '粉丝牌与房间权益', 'backpack', backpackChoices.filter(value => ['vipExpiry', 'badgeDays', 'chatBadgeDays', 'pocket'].includes(value.key))),
  ...options('backpack', '荧光棒续牌', 'backpack', backpackChoices.filter(value => value.key === 'glow')),
  item('backpack', '荧光棒续牌', '默认每房赠送', '荧光棒赠送数量；填 0 时平均分配到全部粉丝牌房间，赠送需手动确认。', '#guanyu-glow-count'),
  item('sign', '今日进度', '今日任务进度', '检查已开启任务、查看逐项结果与失败原因，打开官方任务中心。', '[data-setting="sign.progress"]'),
  item('sign', '自动处理', '自动签到与每日任务', '自动执行已勾选的任务，同账号多个页面共享进度；关闭设置窗口后继续运行，每天按北京时间重新开始。', '[data-setting="sign.enabled"]'),
  ...signTasks.filter(value => value.id === 'client').map(value => item('sign', '客户端签到', value.label, value.help, `[data-setting="sign.${value.id}"]`)),
  item('sign', '客户端签到', clientRemedyChoice.label, clientRemedyChoice.help, '[data-setting="sign.clientRemedy"]'),
  ...signTasks.filter(value => value.id !== 'client' && value.id !== 'starPacket').map(value => item('sign', '其他每日任务', value.label, value.help, `[data-setting="sign.${value.id}"]`)),
  item('sign', '鱼吧未完成提醒', '晚间提醒', '到时仍未完成且已有失败记录时提醒，每账号每天一次；关闭提醒仍会自动重试。', '[data-setting="sign.reminderEnabled"]'),
  item('sign', '鱼吧未完成提醒', '提醒时间（北京时间）', '设置鱼吧未完成任务的晚间提醒时间。', '#sign-reminder-time'),
  ...signTasks.filter(value => value.id === 'starPacket').map(value => item('sign', '当前房间的星推荐红包', value.label, value.help, '[data-setting="sign.starPacket"]')),
  item('menu', '当前菜单', '编排播放器右键菜单', '添加、移除和拖动排序观鱼动作，恢复默认预设；保留官方菜单项。', '.menu-editor > section > h2'),
  ...menuActions.map(value => item('menu', '可编排动作', value.label, '在播放器右键菜单中添加、移除或排序此动作。', `[data-menu-action="${value.id}"]`)),
  item('general', '观鱼外观', '主题', '调整观鱼窗口与工具的明暗主题：跟随页面、浅色、深色。', '.theme-picker'),
  item('general', '观鱼外观', '主题色', '斗鱼橙、青绿、湖蓝、藤紫、玫红，调整观鱼窗口与工具的颜色。', '.accent-picker'),
];

export function searchTerms(query: string) {
  return [...new Set(query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean))];
}

export function searchSettings(query: string): SettingGroup[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const groups = new Map<string, SettingGroup>();
  for (const section of settingsSections) {
    for (const entry of catalog) {
      if (entry.section !== section.id) continue;
      const text = `${entry.title} ${entry.path} ${entry.description}`.toLocaleLowerCase();
      if (!terms.every(term => text.includes(term))) continue;
      const id = `${entry.section}:${entry.group}`;
      let group = groups.get(id);
      if (!group) { group = { id, path: entry.path, items: [] }; groups.set(id, group); }
      group.items.push(entry);
    }
  }
  return [...groups.values()];
}

export function highlightMatches(value: string, terms: string[]) {
  if (!terms.length) return [{ text: value, match: false }];
  const pattern = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  return value.split(pattern).filter(Boolean).map(text => ({ text, match: terms.includes(text.toLocaleLowerCase()) }));
}
