export const menuActions = [
  { id: 'roomInfo', label: '主播配置信息' }, { id: 'hideGiftBar', label: '隐藏 / 显示礼物栏' },
  { id: 'collapseChat', label: '收起 / 恢复聊天活动区' }, { id: 'mirror', label: '画面镜像' },
  { id: 'settings', label: '观鱼设置' }, { id: 'team', label: '团播名单' },
  { id: 'preview', label: '开启 / 关闭团播预览' }, { id: 'multi', label: '进入 / 退出多屏' },
  { id: 'editMulti', label: '编辑多屏' },
  { id: 'refreshTeam', label: '刷新团播开播状态' },
  { id: 'hidePk', label: '隐藏 / 显示 PK 条' }, { id: 'hideActivities', label: '隐藏 / 显示活动浮窗' },
  { id: 'hideAds', label: '隐藏 / 显示页面广告' },
  { id: 'gain', label: '开启 / 关闭音量增益' }, { id: 'soundSettings', label: '声音设置' },
  { id: 'optimizationSettings', label: '优化设置' }, { id: 'barrageSettings', label: '弹幕设置' },
  { id: 'teamSettings', label: '团播设置' }, { id: 'multiSettings', label: '多屏设置' }, { id: 'menuSettings', label: '右键菜单设置' },
  { id: 'signSettings', label: '签到' },
] as const;
export type MenuAction = typeof menuActions[number]['id'];
export const menuDefaults: MenuAction[] = ['roomInfo', 'hideGiftBar', 'mirror', 'settings', 'multi'];
export function readPlayerMenu(input: unknown): MenuAction[] {
  if (input === undefined) return [...menuDefaults];
  if (!Array.isArray(input) || input.some(id => id !== 'replaceScreen' && !menuActions.some(action => action.id === id)) || new Set(input).size !== input.length) throw new Error('右键菜单配置无效');
  return input.filter(id => id !== 'replaceScreen');
}
