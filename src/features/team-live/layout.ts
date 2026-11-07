export interface Person {
  id: string;
  roomId: string;
  name: string;
  label: string;
}

export interface Team {
  id: string;
  name: string;
  color?: string;
  captains: string[];
  members: string[];
}

export const teamColors = [
  { name: '红色', value: '#d94e4e' }, { name: '蓝色', value: '#387bd6' },
  { name: '绿色', value: '#288965' }, { name: '黄色', value: '#b18b18' },
  { name: '紫色', value: '#9460c5' }, { name: '橙色', value: '#c77422' },
  { name: '青色', value: '#248e9b' }, { name: '粉色', value: '#c55289' },
] as const;

export function nextTeamColor(teams: Team[], index = teams.length) {
  const used = new Set(teams.map(team => team.color?.toLowerCase()));
  return teamColors.find(color => !used.has(color.value))?.value ?? teamColors[index % teamColors.length]!.value;
}

export interface TeamLayout {
  peopleTitle: string;
  people: Person[];
  teams: Team[];
  customRooms?: CustomRoom[];
}

export interface CustomRoom {
  id: string;
  name: string;
  avatar: string;
  live: boolean;
}

export function emptyLayout(): TeamLayout {
  return { peopleTitle: '团长', people: [], teams: [], customRooms: [] };
}

export function visibleTeams(layout: TeamLayout) {
  return layout.teams.filter(team => team.captains.length || team.members.length);
}

export function previewGroups(layout: TeamLayout, currentRoom: string) {
  const people = layout.people.map(person => person.roomId);
  return [
    ...(people.length ? [{ name: layout.peopleTitle, initial: people, remaining: [] as string[], independent: true }] : []),
    ...visibleTeams(layout).map(team => {
      const hasCaptain = team.captains.some(id => id !== currentRoom);
      return { name: team.name, color: team.color, initial: hasCaptain ? team.captains : [...team.captains, ...team.members], remaining: hasCaptain ? team.members : [], independent: false };
    }),
  ];
}

export function layoutRooms<T extends CustomRoom>(layout: TeamLayout, native: T[], statuses?: Map<string, boolean>): (T | CustomRoom)[] {
  const rooms = new Map<string, T | CustomRoom>(native.map(room => [room.id, room]));
  for (const room of layout.customRooms ?? []) if (!rooms.has(room.id)) rooms.set(room.id, { ...room, live: statuses?.get(room.id) ?? room.live });
  return [...rooms.values()];
}

export function teamColumns(count: number, width: number, preferred = 0) {
  return Math.max(1, Math.min(count, preferred || count, Math.floor((width + 12) / 212) || 1));
}

function memberColumns(count: number, capacity: number, wide: boolean, compact: boolean) {
  if (count <= 1 || compact && count <= 5) return 1;
  const limit = Math.max(1, Math.min(count, capacity));
  if (wide) {
    const rows = Math.ceil(count / limit);
    for (let columns = limit; columns > 1; columns--) if (count % columns === 0 && count / columns <= rows + 1) return columns;
    return Math.ceil(count / rows);
  }
  for (let columns = Math.min(limit, Math.floor(Math.sqrt(count))); columns > 1; columns--) if (count % columns === 0) return columns;
  return count <= 5 ? count <= limit ? count : 1 : Math.min(limit, Math.ceil(Math.sqrt(count)));
}

export function teamGrid(teams: Team[], width: number, preferred = 0, mode: 'auto' | 'native' | 'fixed' = 'auto', fixedColumns = 0) {
  const average = teams.reduce((sum, team) => sum + team.members.length, 0) / (teams.length || 1);
  const compact = teams.length >= 4 && average <= 5;
  const stacked = teams.length >= 6 && average >= 8;
  const minimum = Math.max(200, ...teams.map(team => memberColumns(team.members.length, 12, false, compact) * 98 + 12));
  const automatic = stacked ? 1 : Math.max(1, Math.floor((width + 12) / (minimum + 12)));
  const columns = teamColumns(teams.length, width, preferred || (mode === 'auto' ? automatic : 0));
  const available = (width - (columns - 1) * 12) / columns - 20;
  const capacity = Math.max(1, Math.floor((available + 8) / 98));
  const members = new Map(teams.map(team => [team.id, mode === 'fixed'
    ? Math.max(1, Math.min(team.members.length, fixedColumns, capacity))
    : memberColumns(team.members.length, capacity, stacked && columns === 1, compact)]));
  return { columns, members };
}

export function copyLayout(value: TeamLayout): TeamLayout {
  return structuredClone(value);
}

export function assignedRooms(layout: TeamLayout) {
  return new Set([...layout.people.map(person => person.roomId), ...layout.teams.flatMap(team => [...team.captains, ...team.members])]);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function roomId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

function name(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 40;
}

function slots(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(roomId) && new Set(value).size === value.length;
}

export function validateLayout(value: unknown): TeamLayout {
  if (!record(value) || !name(value.peopleTitle) || !Array.isArray(value.people) || !Array.isArray(value.teams)
    || value.people.some(person => !record(person) || !name(person.id) || !roomId(person.roomId)
      || !name(person.name) || typeof person.label !== 'string' || person.label.length > 40)
    || value.teams.some(team => !record(team) || !name(team.id) || !name(team.name) || !slots(team.captains) || !slots(team.members)
      || team.color !== undefined && (typeof team.color !== 'string' || !/^#[\da-f]{6}$/i.test(team.color)))
    || new Set(value.people.map(person => person.id)).size !== value.people.length
    || new Set(value.teams.map(team => team.id)).size !== value.teams.length
    || (value.customRooms !== undefined && (!Array.isArray(value.customRooms)
      || value.customRooms.some(room => !record(room) || !roomId(room.id) || !name(room.name) || typeof room.avatar !== 'string' || typeof room.live !== 'boolean')
      || new Set(value.customRooms.map(room => room.id)).size !== value.customRooms.length))) {
    throw new Error('名单格式无效：名称需为 1～40 个字符，队伍颜色需为 #RRGGBB，房间号和分组不能损坏或重复');
  }
  const layout = copyLayout(value as unknown as TeamLayout);
  layout.teams.forEach((team, index) => { team.color ??= nextTeamColor(layout.teams, index); });
  return layout;
}

interface Share {
  version: 1;
  activity: string;
  rooms: string[];
  layout: TeamLayout;
}

export function exportLayout(layout: TeamLayout, activity: string, rooms: string[]) {
  const value: Share = { version: 1, activity, rooms: [...rooms].sort(), layout: validateLayout(layout) };
  const binary = Array.from(new TextEncoder().encode(JSON.stringify(value)), byte => String.fromCharCode(byte)).join('');
  return `GUANYU1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function importLayout(text: string, activity: string, rooms: string[]) {
  const code = text.replace(/\s/g, '');
  if (!code || code.length > 2_000_000) throw new Error('请粘贴完整的观鱼分享码');
  const match = code.match(/^GUANYU(\d+)\.([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error('分享码格式不正确，请使用观鱼导出的分享码');
  if (match[1] !== '1') throw new Error('暂不支持此版本的分享码');
  let value: unknown;
  try {
    const binary = atob(match[2]!.replace(/-/g, '+').replace(/_/g, '/'));
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
  } catch { throw new Error('分享码已损坏，请重新复制'); }
  if (!record(value) || value.version !== 1 || typeof value.activity !== 'string'
    || !/^(page-\d+|rooms-\d+(?:-\d+)*)$/.test(value.activity) || !slots(value.rooms) || !value.rooms.length) {
    throw new Error('分享码中的活动信息无效');
  }
  const sameRooms = JSON.stringify([...value.rooms].sort()) === JSON.stringify([...rooms].sort());
  const bothIdentified = value.activity.startsWith('page-') && activity.startsWith('page-');
  if (value.activity !== activity && (bothIdentified || !sameRooms)) throw new Error('分享码属于其他团播活动，当前草稿未改变');
  return validateLayout(value.layout);
}
