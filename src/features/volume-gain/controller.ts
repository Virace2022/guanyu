import type { PlayerStore } from '../../adapters/douyu/player';
import type { SettingsStore } from '../../config/settings';
import { createState } from '../../core/state';
import { GainAudio } from './audio';

const roomPrefix = 'guanyu:gain:room:';
export interface GainState {
  roomId: string | null;
  available: boolean;
  amount: number;
  maxAmount: number;
  status: string;
  error: string;
}

export function createGain(player: PlayerStore, settings: SettingsStore, storage: Storage, events: Window) {
  const state = createState<GainState>({ roomId: null, available: false, amount: 100,
    maxAmount: settings.value.maxMultiplier * 100, status: '等待播放器加载', error: '' });
  let lastAmount = 120;
  const clamp = (value: number) => Math.round(Math.min(state.value.maxAmount, Math.max(100, value)));
  const audio = new GainAudio(status => state.set({ ...state.value, status }));

  function readRoom(room: string | null) {
    let amount = 100;
    lastAmount = clamp(120);
    let error = '';
    if (room) {
      try {
        const raw = storage.getItem(roomPrefix + room);
        if (raw !== null) {
          const value = JSON.parse(raw);
          if (!Number.isFinite(value.amount) || !Number.isFinite(value.lastAmount)) throw new Error('房间增益格式无效');
          amount = clamp(value.amount);
          lastAmount = clamp(value.lastAmount);
        }
      } catch (cause) { error = `房间增益读取失败：${String(cause)}`; }
    }
    state.set({ ...state.value, roomId: room, amount, error,
      status: amount > 100 ? '点击播放器或增益按钮恢复增益' : '当前为原声' });
  }

  function persist() {
    if (!state.value.roomId) return;
    try {
      storage.setItem(roomPrefix + state.value.roomId, JSON.stringify({ amount: state.value.amount, lastAmount }));
      state.set({ ...state.value, error: '' });
    } catch (cause) { state.set({ ...state.value, error: `本次有效，房间增益未能保存：${String(cause)}` }); }
  }

  const stopPlayer = player.subscribe(value => {
    if (value.roomId !== state.value.roomId) readRoom(value.roomId);
    state.set({ ...state.value, available: value.roomId !== null && value.video !== null });
    audio.setMedia(value.roomId ? value.video : null, state.value.amount);
  });
  const stopSettings = settings.subscribe(value => {
    const maxAmount = Math.round(value.maxMultiplier * 100);
    const lowered = maxAmount < state.value.maxAmount;
    state.set({ ...state.value, maxAmount, amount: Math.min(state.value.amount, maxAmount) });
    lastAmount = Math.min(lastAmount, maxAmount);
    audio.setMedia(player.value.video, state.value.amount);
    if (lowered) persist();
  });

  function setAmount(amount: number) {
    if (!state.value.available || !Number.isFinite(amount)) return;
    const next = clamp(amount);
    if (next > 100) lastAmount = next;
    state.set({ ...state.value, amount: next });
    persist();
    audio.setMedia(player.value.video, next);
    if (next > 100) void audio.activate();
    else state.set({ ...state.value, status: '已恢复原声' });
  }

  function resume(event: Event) {
    if (event.isTrusted && state.value.available && state.value.amount > 100) void audio.activate();
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== roomPrefix + state.value.roomId) return;
    readRoom(state.value.roomId);
    audio.setMedia(player.value.video, state.value.amount);
  }
  events.addEventListener('storage', onStorage);
  document.addEventListener('pointerdown', resume, true);
  document.addEventListener('keydown', resume, true);

  return {
    subscribe: state.subscribe,
    get value() { return state.value; },
    setAmount,
    toggle: () => setAmount(state.value.amount > 100 ? 100 : lastAmount > 100 ? lastAmount : clamp(120)),
    dispose() {
      stopPlayer(); stopSettings(); audio.dispose();
      events.removeEventListener('storage', onStorage);
      document.removeEventListener('pointerdown', resume, true);
      document.removeEventListener('keydown', resume, true);
    },
  };
}

export type GainController = ReturnType<typeof createGain>;
