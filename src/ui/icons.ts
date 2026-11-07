const paths = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  guild: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="M8 9h8m-4 0v7m-2-4h4"/>',
  glow: '<path d="m4 20 9-9 3 3-9 9zM11 4v3m-4 4H4m13-5 2-2m0 7h3m-5 7v3"/>',
  wallet: '<path d="M5 4a3 3 0 0 0-3 3v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a1 1 0 0 1 0-2h13V4H5z"/><path fill="var(--guanyu-native-icon-detail, currentColor)" fill-rule="evenodd" d="M16 10a2 2 0 0 0 0 4h6v-4h-6zm0 1.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/>',
  eye: '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/><circle fill="var(--guanyu-native-icon-detail, currentColor)" cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="2.25"/>',
  eyeOff: '<path d="m2.27 1 20.73 20.73L21.73 23l-4.35-4.35A11.94 11.94 0 0 1 12 19.5C7 19.5 2.73 16.39 1 12a13.43 13.43 0 0 1 4.27-5.46L1 2.27 2.27 1zM7.53 8.8a5 5 0 0 0 6.67 6.67l-1.6-1.6a3 3 0 0 1-3.47-3.47l-1.6-1.6zM12 4.5c5 0 9.27 3.11 11 7.5a13.37 13.37 0 0 1-3.23 4.54l-2.98-2.98A5 5 0 0 0 10.44 7.21L8.23 5A12.1 12.1 0 0 1 12 4.5z"/><path fill="var(--guanyu-native-icon-detail, currentColor)" d="m2.27 1 20.73 20.73L21.73 23 1 2.27z"/>',
  crown: '<path d="m3 7 4 3 5-6 5 6 4-3-2 13H5z"/>',
  diamond: '<path d="m3 8 4-5h10l4 5-9 13zM3 8h18M7 3l5 18 5-18"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

export function createIcon(name: keyof typeof paths) {
  const solid = name === 'wallet' || name === 'eye' || name === 'eyeOff';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: solid ? 'currentColor' : 'none', stroke: solid ? 'none' : 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(key, value);
  icon.innerHTML = paths[name]; icon.style.fill = solid ? 'currentColor' : 'none'; icon.style.stroke = solid ? 'none' : 'currentColor'; icon.style.strokeWidth = solid ? '0' : '1.8px';
  // 原生页面会把 SVG 子元素描边归零，自有线形图标需要显式恢复继承。
  for (const shape of icon.children) { const style = (shape as SVGElement).style; style.strokeWidth = 'inherit'; style.stroke = 'inherit'; style.fill = solid ? shape.getAttribute('fill') ?? 'inherit' : 'none'; }
  return icon;
}
