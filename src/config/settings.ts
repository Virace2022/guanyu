import { createState } from '../core/state';
import { barrageDefaults, nativeShieldDefaults, optimizationDefaults, readOptions, type BarrageOptions, type NativeShieldOptions, type OptimizationOptions } from './options';
import { teamDefaults, readTeamOptions, type TeamOptions } from './team';
import { multiDefaults, readMultiOptions, type MultiOptions } from './multiscreen';
import { menuDefaults, readPlayerMenu, type MenuAction } from './player-menu';
import { signDefaults, readSignOptions, type SignOptions } from './sign';
import { playbackDefaults, roomDefaults, backpackDefaults, readPlayback, readRoom, readBackpack, type PlaybackOptions, type RoomOptions, type BackpackOptions } from './enhancements';

export type Theme = 'page' | 'light' | 'dark';
export type SettingsPreview = Pick<Settings, 'theme' | 'accentColor' | 'optimization' | 'nativeShield'> & {
  barrage: Omit<BarrageOptions, 'linked'>;
  team: Pick<TeamOptions, 'showToolbar' | 'columns' | 'teamColumns' | 'alignment' | 'originalWidth'>;
};
export interface Settings {
  theme: Theme;
  accentColor: string;
  maxMultiplier: number;
  gainPresets: number[];
  optimization: OptimizationOptions;
  barrage: BarrageOptions;
  nativeShield: NativeShieldOptions;
  team: TeamOptions;
  multi: MultiOptions;
  playerMenu: MenuAction[];
  sign: SignOptions;
  playback: PlaybackOptions;
  room: RoomOptions;
  backpack: BackpackOptions;
}

export const settingsKey = 'guanyu:settings:v1';
export const defaults: Settings = { theme: 'page', accentColor: '#ff5d23', maxMultiplier: 2,
  gainPresets: [0, 50, 100, 150], optimization: { ...optimizationDefaults }, barrage: { ...barrageDefaults }, nativeShield: { ...nativeShieldDefaults },
  team: { ...teamDefaults }, multi: { ...multiDefaults, custom: [] }, playerMenu: [...menuDefaults], sign: { ...signDefaults },
  playback: { ...playbackDefaults }, room: { ...roomDefaults }, backpack: { ...backpackDefaults } };

export function validatePresets(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 8
    || value.some(extra => !Number.isInteger(extra) || extra < 0 || extra > 400)
    || new Set(value).size !== value.length) throw new Error('常用档位最多 8 个，使用不重复的 0～400% 整数');
  return [...value].sort((a, b) => a - b);
}

function validate(value: Settings): Settings {
  if (!['page', 'light', 'dark'].includes(value.theme) || !/^#[\da-f]{6}$/i.test(value.accentColor)) {
    throw new Error('主题或主题色格式无效');
  }
  if (!Number.isFinite(value.maxMultiplier) || value.maxMultiplier < 1 || value.maxMultiplier > 5) {
    throw new Error('最大倍率应为 1.0～5.0 倍');
  }
  return { ...value, maxMultiplier: Math.round(value.maxMultiplier * 10) / 10, gainPresets: validatePresets(value.gainPresets),
    optimization: readOptions(value.optimization, optimizationDefaults), barrage: readOptions(value.barrage, barrageDefaults),
    nativeShield: readOptions(value.nativeShield, nativeShieldDefaults), team: readTeamOptions(value.team), multi: readMultiOptions(value.multi), playerMenu: readPlayerMenu(value.playerMenu), sign: readSignOptions(value.sign),
    playback: readPlayback(value.playback), room: readRoom(value.room), backpack: readBackpack(value.backpack) };
}

function read(storage: Storage): Settings {
  const raw = storage.getItem(settingsKey);
  if (raw === null) return { ...defaults, gainPresets: [...defaults.gainPresets] };
  const value = JSON.parse(raw);
  return validate({ theme: value.theme, accentColor: value.accentColor ?? defaults.accentColor,
    maxMultiplier: value.maxMultiplier, gainPresets: value.gainPresets ?? defaults.gainPresets,
    optimization: value.optimization, barrage: value.barrage, nativeShield: value.nativeShield,
    team: value.team, multi: value.multi, playerMenu: value.playerMenu, sign: value.sign,
    playback: value.playback, room: value.room, backpack: value.backpack });
}

export function createSettings(storage: Storage, events: Window) {
  let loadError = '';
  let initial = { ...defaults };
  try { initial = read(storage); }
  catch (error) { loadError = `设置读取失败：${String(error)}`; }
  const state = createState(initial);
  const runtime = createState(initial);
  let draft: SettingsPreview | null = null;

  function refreshRuntime() {
    const value = state.value;
    const next = draft ? { ...value, ...draft, barrage: { ...value.barrage, ...draft.barrage }, team: { ...value.team, ...draft.team } } : value;
    if (JSON.stringify(next) !== JSON.stringify(runtime.value)) runtime.set(next);
  }

  function save(value: Settings) {
    const next = validate(value);
    storage.setItem(settingsKey, JSON.stringify(next));
    loadError = '';
    draft = null;
    state.set(next);
    refreshRuntime();
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== settingsKey && event.key !== null) return;
    try { const value = read(storage); loadError = ''; state.set(value); refreshRuntime(); }
    catch (error) { loadError = `设置读取失败：${String(error)}`; }
  }
  events.addEventListener('storage', onStorage);

  return {
    ...state,
    get value() { return state.value; },
    get error() { return loadError; },
    runtime: { subscribe: runtime.subscribe, get value() { return runtime.value; } },
    preview(value: SettingsPreview | null) { draft = value; refreshRuntime(); },
    save,
    dispose: () => events.removeEventListener('storage', onStorage),
  };
}

export type SettingsStore = ReturnType<typeof createSettings>;
