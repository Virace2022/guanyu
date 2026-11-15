import { diagnostics, type DiagnosticError } from '../core/diagnostics';
import { bindTheme } from './theme';
import { isolateKeyboard } from './modal';
import styles from './error-notices.css?style';

export function mountErrorNotices() {
  const host = document.createElement('div'); host.id = 'guanyu-errors';
  const root = host.attachShadow({ mode: 'open' });
  root.append(styles.cloneNode(true));
  const panel = document.createElement('section'); panel.popover = 'manual';
  panel.setAttribute('aria-label', '观鱼错误提示');
  const heading = document.createElement('strong'); heading.className = 'heading';
  const list = document.createElement('div'); list.setAttribute('role', 'alert');
  panel.append(heading, list); root.append(panel); document.body.append(host);
  const theme = bindTheme(host), stopKeyboard = isolateKeyboard(root);
  const rows = new Map<string, { node: HTMLElement; title: HTMLElement; detail: HTMLElement; timer?: ReturnType<typeof setTimeout> }>();
  let modal: HTMLDialogElement | null = null;
  function restoreHost() {
    const visible = panel.matches(':popover-open');
    if (visible) panel.hidePopover();
    modal?.removeEventListener('close', restoreHost); modal = null;
    document.body.append(host);
    if (visible) panel.showPopover();
  }
  function render(errors: DiagnosticError[]) {
    if (errors.length) {
      const next = [...document.querySelectorAll<HTMLElement>('[id^="guanyu-"]')]
        .map(node => node.shadowRoot?.querySelector<HTMLDialogElement>('dialog:modal')).find(Boolean) || null;
      if (next !== modal || !host.isConnected) {
        if (panel.matches(':popover-open')) panel.hidePopover();
        modal?.removeEventListener('close', restoreHost); modal = next;
        modal?.addEventListener('close', restoreHost);
        (modal || document.body).append(host);
      }
    }
    for (const [key, row] of rows) if (!errors.some(error => error.key === key)) { clearTimeout(row.timer); row.node.remove(); rows.delete(key); }
    for (const error of errors) {
      let row = rows.get(error.key);
      if (!row) {
        const node = document.createElement('article'), title = document.createElement('strong'), detail = document.createElement('p');
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
        close.setAttribute('aria-label', `关闭${error.name}错误提示`);
        close.addEventListener('click', () => diagnostics.dismissError(error.key));
        node.append(title, detail, close); list.append(node);
        row = { node, title, detail }; rows.set(error.key, row);
      }
      row.title.textContent = `${error.category} · ${error.name} · ${error.stage}`;
      if (row.detail.textContent !== error.detail) {
        row.detail.textContent = error.detail;
        clearTimeout(row.timer);
        row.timer = setTimeout(() => diagnostics.dismissError(error.key), 8000);
      }
    }
    heading.textContent = `观鱼运行出错${errors.length > 1 ? `（${errors.length}）` : ''}`;
    if (errors.length && !panel.matches(':popover-open')) panel.showPopover();
    else if (!errors.length && panel.matches(':popover-open')) panel.hidePopover();
  }
  const stop = diagnostics.subscribeErrors(render);
  const onFullscreen = () => { if (panel.matches(':popover-open')) { panel.hidePopover(); panel.showPopover(); } };
  document.addEventListener('fullscreenchange', onFullscreen);
  return () => { stop(); for (const row of rows.values()) clearTimeout(row.timer); modal?.removeEventListener('close', restoreHost); stopKeyboard(); theme.destroy(); document.removeEventListener('fullscreenchange', onFullscreen); host.remove(); };
}
