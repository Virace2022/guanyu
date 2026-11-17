import type { SettingsStore } from '../../config/settings';
import { diagnostics } from '../../core/diagnostics';
import { createIcon } from '../../ui/icons';
import styles from '../../ui/page-controls.css?style';

export function mountPageControls(settings: SettingsStore, togglePk: () => void, toggleGift: () => void) {
  const host = document.createElement('div'); host.id = 'guanyu-page-controls';
  const style = styles.cloneNode(true); document.head.append(style);
  const buttons = [
    { key: 'hidePk' as const, label: 'PK 条', run: togglePk },
    { key: 'hideGiftBar' as const, label: '礼物栏', run: toggleGift },
  ].map(action => {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-label', action.label);
    button.addEventListener('click', event => {
      event.stopPropagation();
      try { action.run(); }
      catch (cause) { diagnostics.failure(`切换${action.label}`, cause); }
      if (event.detail > 0) button.blur();
    });
    host.append(button);
    return { ...action, button };
  });
  function mount() {
    const pk = document.querySelector('#js-player-main :is(.PkView-9f6a2c, .MorePk, .RandomPKBar, .maiMaitView-68e80c, .PkView)');
    buttons[0]!.button.hidden = !pk;
    const shield = document.querySelector('#js-player-controlbar [class^="shieldSetting-"]');
    if (!shield) { host.remove(); return; }
    if (shield.nextElementSibling !== host) shield.after(host);
  }
  const stop = settings.runtime.subscribe(value => {
    for (const { key, label, button } of buttons) {
      const hidden = value.optimization[key];
      const name = key === 'hidePk' ? ` ${label}` : label;
      button.title = `${hidden ? '显示' : '隐藏'}${name}`;
      button.setAttribute('aria-pressed', String(!hidden));
      button.replaceChildren(createIcon(`${key === 'hidePk' ? 'pk' : 'gift'}${hidden ? 'Hidden' : 'Shown'}`));
    }
    mount();
  });
  let root: Element | null = null;
  const observer = new MutationObserver(mount);
  function connect() {
    const next = document.getElementById('js-player-main');
    if (next !== root) { observer.disconnect(); root = next; if (root) observer.observe(root, { childList: true, subtree: true }); }
    mount();
  }
  const timer = setInterval(connect, 1000); connect();
  return () => { stop(); clearInterval(timer); observer.disconnect(); host.remove(); style.parentNode?.removeChild(style); };
}
