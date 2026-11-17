import { mountPageTools } from '../../adapters/douyu/page';
import type { SettingsStore } from '../../config/settings';
import { createState } from '../../core/state';
import { mountNativeShield } from '../../adapters/douyu/native-shield';
import { mountPageControls } from '../../adapters/douyu/page-controls';

export function createPageTools(settings: SettingsStore, nativePage: Window) {
  const state = createState({ shieldStatus: '等待斗鱼原生屏蔽控件' });
  const page = mountPageTools(toggleChat);
  const shield = mountNativeShield(nativePage);
  const stopControls = mountPageControls(settings, () => toggleOption('hidePk'), () => toggleOption('hideGiftBar'));
  const stopShield = shield.subscribe(shieldStatus => state.set({ ...state.value, shieldStatus }));
  const stop = settings.runtime.subscribe(value => {
    page.apply(value.optimization, value.accentColor);
    shield.apply(value.nativeShield);
  });
  function toggleOption(key: 'collapseChat' | 'hideGiftBar' | 'hidePk') {
    settings.save({ ...settings.value, optimization: { ...settings.value.optimization, [key]: !settings.value.optimization[key] } });
  }
  function toggleChat() { toggleOption('collapseChat'); }
  return {
    subscribe: state.subscribe, get value() { return state.value; }, toggleChat,
    toggleGiftBar() { toggleOption('hideGiftBar'); },
    dispose() { stop(); stopShield(); stopControls(); shield.dispose(); page.dispose(); },
  };
}

export type PageTools = ReturnType<typeof createPageTools>;
