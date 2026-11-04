export interface Person {
  id: string;
  roomId: string;
  name: string;
  label: string;
}

export interface Team {
  id: string;
  name: string;
  captains: string[];
  members: string[];
}

export interface TeamLayout {
  peopleTitle: string;
  people: Person[];
  teams: Team[];
}

export function emptyLayout(): TeamLayout {
  return { peopleTitle: '独立人物', people: [], teams: [] };
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
    || value.teams.some(team => !record(team) || !name(team.id) || !name(team.name) || !slots(team.captains) || !slots(team.members))
    || new Set(value.people.map(person => person.id)).size !== value.people.length
    || new Set(value.teams.map(team => team.id)).size !== value.teams.length) {
    throw new Error('名单格式无效：名称需为 1～40 个字符，房间号和分组不能损坏或重复');
  }
  return copyLayout(value as unknown as TeamLayout);
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
