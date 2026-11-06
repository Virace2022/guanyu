import { mountPageTools } from '../../adapters/douyu/page';
import type { SettingsStore } from '../../config/settings';
import { createState } from '../../core/state';
import { mountNativeShield } from '../../adapters/douyu/native-shield';

export function createPageTools(settings: SettingsStore, nativePage: Window) {
  const state = createState({ mirrored: false, shieldStatus: '等待斗鱼原生屏蔽控件' });
  const page = mountPageTools(toggleChat);
  const shield = mountNativeShield(nativePage);
  const stopShield = shield.subscribe(shieldStatus => state.set({ ...state.value, shieldStatus }));
  const stop = settings.runtime.subscribe(value => {
    page.apply(value.optimization, state.value.mirrored, value.accentColor);
    shield.apply(value.nativeShield);
  });
  function toggleOption(key: 'collapseChat' | 'hideGiftBar') {
    settings.save({ ...settings.value, optimization: { ...settings.value.optimization, [key]: !settings.value.optimization[key] } });
  }
  function toggleChat() { toggleOption('collapseChat'); }
  return {
    subscribe: state.subscribe, get value() { return state.value; }, toggleChat,
    toggleGiftBar() { toggleOption('hideGiftBar'); },
    toggleMirror() {
      state.set({ ...state.value, mirrored: !state.value.mirrored });
      page.apply(settings.runtime.value.optimization, state.value.mirrored, settings.runtime.value.accentColor);
    },
    dispose() { stop(); stopShield(); shield.dispose(); page.dispose(); },
  };
}

export type PageTools = ReturnType<typeof createPageTools>;
