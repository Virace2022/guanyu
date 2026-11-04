export interface MultiOptions { enabled: boolean; useFollow: boolean; compact: boolean; independentVolume: boolean; centerLabels: boolean; custom: number[] }
export const multiDefaults: MultiOptions = { enabled: true, useFollow: true, compact: true, independentVolume: false, centerLabels: true, custom: [] };
export function readMultiOptions(input: unknown): MultiOptions {
  const value = { ...multiDefaults, ...(input as Partial<MultiOptions> | undefined) };
  if (['enabled', 'useFollow', 'compact', 'independentVolume', 'centerLabels'].some(key => typeof value[key as keyof MultiOptions] !== 'boolean')
    || !Array.isArray(value.custom) || value.custom.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('多屏设置格式无效');
  return { ...value, custom: [...new Set(value.custom)] };
}
