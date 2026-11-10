import type { SignController } from '../features/sign/feature';
import type { TeamController } from '../features/team-live/controller';
import type { MultiscreenController } from '../features/multiscreen/feature';
import { diagnostics } from './diagnostics';

export function observeRuntimeLogs(team: TeamController, multi: MultiscreenController, sign: SignController) {
  const stops = [
    team.subscribe(value => {
      diagnostics.report('team.detect', value.source ? 'ready' : 'idle', value.source ? '已识别官方团播成员名单' : value.candidate ? '已发现同模板名单，当前识别规则将其排除' : '当前无团播名单，继续观察 .wm-pc-switchroom / .room-info');
      if (!value.source) diagnostics.report('team.showToolbar', 'idle', '当前没有适用的团播名单');
      if (!value.source) diagnostics.report('team.preview', 'idle', '当前没有适用的团播名单');
      if (value.error) diagnostics.report('team.layout', 'error', value.error, '配置');
      if (!value.source) diagnostics.report('team.autoRefresh', 'idle', '当前没有适用的团播名单');
      else if (value.statusError) diagnostics.report('team.autoRefresh', 'error', value.statusError, '接口');
      else if (!value.refreshing && value.lastRefresh) diagnostics.report('team.autoRefresh', 'applied', '已取得成员开播状态', '接口');
    }),
    multi.quality.subscribe(rooms => {
      for (const [id, value] of rooms) {
        if (value.error) diagnostics.report('multi.quality', 'error', value.error, `房间 ${id}`);
        else if (value.ready) diagnostics.report('multi.quality', 'ready', '官方播放器已提供画质能力与当前档位', `房间 ${id}`);
      }
    }),
    sign.subscribe(value => {
      diagnostics.report('sign', value.error ? 'error' : !value.uid ? 'idle' : value.running ? 'ready' : 'waiting', value.error || (!value.uid ? '等待登录，尚未执行任务' : value.running ? '本页正在执行账号任务' : '等待账号调度权、任务间隔或其他页面同步'), '调度');
      for (const row of value.rows) if (row.status !== 'disabled') diagnostics.report(`sign.${row.id}`, row.status === 'done' ? 'applied' : row.status === 'error' ? 'error' : 'waiting', row.detail || '等待调度执行', '任务');
    }),
  ];
  return () => { for (const stop of stops) stop(); };
}
