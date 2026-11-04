import type { TeamController } from '../features/team-live/controller';
import { confirmAction } from './confirm';

export async function toggleTeamPreview(team: TeamController, roomId: string, openEditor: () => void, members = false) {
  const source = team.value.source;
  if (!source) return;
  const expected = source.activity, layout = team.value.layout, grouped = team.value.grouped;
  const rooms = source.rooms.map(room => room.id).join(',');
  const enabled = members ? true : !team.value.preview;
  const showMembers = members ? !team.value.previewMembers : false;
  const count = team.previewCount(showMembers, roomId);
  const opening = enabled && (!team.value.preview || showMembers && !team.value.previewMembers);
  if (opening) {
    if (!count) {
      const message = grouped ? '分组预览先显示独立人物和队长。当前没有可预览成员，请先编排名单，或切回原始布局预览全部成员。' : '当前名单中没有其他可预览房间。';
      if (await confirmAction('暂无可预览成员', message, '打开名单')) openEditor();
      return;
    }
    const scope = grouped ? showMembers ? '分组中的独立人物、队长和队员' : '分组中的独立人物和队长' : '全部活动成员';
    const message = `本次预览${scope}，共 ${count} 个预览窗口（不含本直播间）。${count > 50 ? '超过建议的 50 个，浏览器可能卡顿。' : ''}是否开启？`;
    if (!await confirmAction(count > 50 ? '预览数量较多' : '开启预览', message, '开启预览')) return;
  }
  if (team.value.source?.activity === expected && team.value.layout === layout && team.value.grouped === grouped
    && team.value.source.rooms.map(room => room.id).join(',') === rooms) team.setPreview(enabled, showMembers);
}
