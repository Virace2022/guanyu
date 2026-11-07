export function isolateKeyboard(root: ShadowRoot) {
  // Shadow DOM 会把输入框目标改写为宿主，隔离事件以免触发官方的全局快捷键。
  const stop = (event: Event) => event.stopPropagation();
  const types = ['keydown', 'keypress', 'keyup'];
  for (const type of types) root.addEventListener(type, stop);
  return () => { for (const type of types) root.removeEventListener(type, stop); };
}

export function showModal(dialog: HTMLDialogElement) {
  if (dialog.matches(':modal')) return;
  // 宿主被原生页面移除后，open 属性仍可能保留，但必须重新进入顶层模态层。
  if (dialog.open) dialog.close();
  dialog.showModal();
}
