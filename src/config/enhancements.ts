import { readOptions } from './options';

export const playbackDefaults = { autoWebFullscreen: true, highestQuality: true, volumeWheel: true, keepBackgroundVideo: true, keepViolationPlayback: true };
export const roomDefaults = { duration: true, guild: true, lastLive: true, closeRecommendation: true, hideUnread: true };
export const backpackDefaults = { details: true, monthCost: true, vipExpiry: true, badgeDays: true, chatBadgeDays: true, pocket: true, glow: true, glowCount: 1 };
export type PlaybackOptions = typeof playbackDefaults;
export type RoomOptions = typeof roomDefaults;
export type BackpackOptions = typeof backpackDefaults;
export const readPlayback = (input: unknown) => readOptions(input, playbackDefaults);
export const readRoom = (input: unknown) => readOptions(input, roomDefaults);
export function readBackpack(input: unknown): BackpackOptions {
  const { glowCount, ...flags } = backpackDefaults;
  const count = (input as Partial<BackpackOptions> | undefined)?.glowCount ?? glowCount;
  if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error('每房荧光棒数量应为 0～100000 的整数，0 表示平均分配');
  const options = readOptions(input, flags);
  const previous = input as Partial<BackpackOptions> | undefined;
  if (previous?.chatBadgeDays === undefined && previous?.badgeDays !== undefined) options.chatBadgeDays = options.badgeDays;
  return { ...options, glowCount: count };
}
