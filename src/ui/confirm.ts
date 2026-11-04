import styles from './settings.css?style';
import motion from './motion.css?style';

export function confirmAction(title: string, message: string, accept = '继续', decline = '取消'): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement('div'), root = host.attachShadow({ mode: 'open' });
    root.append(styles.cloneNode(true), motion.cloneNode(true));
    const dialog = document.createElement('dialog'); dialog.className = 'action-dialog';
    const heading = document.createElement('h2'); heading.textContent = title;
    const text = document.createElement('p'); text.textContent = message;
    const actions = document.createElement('div'); actions.className = 'confirm-actions';
    const cancel = document.createElement('button'); cancel.className = 'button'; cancel.textContent = decline;
    const proceed = document.createElement('button'); proceed.className = 'button primary'; proceed.textContent = accept;
    const finish = (value: boolean) => { dialog.close(); host.remove(); resolve(value); };
    cancel.onclick = () => finish(false); proceed.onclick = () => finish(true);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    actions.append(cancel, proceed); dialog.append(heading, text, actions); root.append(dialog);
    (document.fullscreenElement || document.body).append(host); dialog.showModal(); cancel.focus({ preventScroll: true });
  });
}
