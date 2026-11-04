export function showModal(dialog: HTMLDialogElement) {
  if (dialog.matches(':modal')) return;
  // 宿主被原生页面移除后，open 属性仍可能保留，但必须重新进入顶层模态层。
  if (dialog.open) dialog.close();
  dialog.showModal();
}
