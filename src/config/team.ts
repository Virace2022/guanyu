export const teamDefaults = {
  columns: 3, teamColumns: 0, alignment: 'center' as 'left' | 'center' | 'right',
  hideBanner: false, originalWidth: false, showToolbar: true, autoRefresh: true, refreshSeconds: 60,
  previewSource: 'lowest' as 'lowest' | 'native', previewRetrySeconds: 60, previewFocusOriginal: false,
};
export type TeamOptions = typeof teamDefaults;
export function readTeamOptions(input: unknown): TeamOptions {
  const value = { ...teamDefaults, ...(input as Partial<TeamOptions> | undefined) };
  if (!Number.isInteger(value.columns) || value.columns < 1 || value.columns > 12
    || !Number.isInteger(value.teamColumns) || value.teamColumns < 0 || value.teamColumns > 12
    || !['left', 'center', 'right'].includes(value.alignment)
    || !['lowest', 'native'].includes(value.previewSource)
    || ![30, 60, 120, 300].includes(value.refreshSeconds)
    || ![0, 30, 60, 120, 300].includes(value.previewRetrySeconds)
    || ['hideBanner', 'originalWidth', 'showToolbar', 'autoRefresh', 'previewFocusOriginal'].some(key => typeof value[key as keyof TeamOptions] !== 'boolean')) throw new Error('团播设置格式或范围无效');
  return value;
}
