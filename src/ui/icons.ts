const paths = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  guild: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="M8 9h8m-4 0v7m-2-4h4"/>',
  glow: '<path d="m4 20 9-9 3 3-9 9zM11 4v3m-4 4H4m13-5 2-2m0 7h3m-5 7v3"/>',
  wallet: '<path fill-rule="evenodd" d="M5 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a2 2 0 0 0 2-2v-2h-5a4 4 0 0 1 0-8h5V7a2 2 0 0 0-2-2H5a1 1 0 0 1 0-2h13V1H5zm11 8a2 2 0 0 0 0 4h6v-4h-6zm0 1.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.5 5.1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6.5A21 21 0 0 0 2 12s3.5 7 10 7c2 0 3.7-.6 5.2-1.5"/>',
  crown: '<path d="m3 7 4 3 5-6 5 6 4-3-2 13H5z"/>',
  diamond: '<path d="m3 8 4-5h10l4 5-9 13zM3 8h18M7 3l5 18 5-18"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

export function createIcon(name: keyof typeof paths) {
  const solid = name === 'wallet';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: solid ? 'currentColor' : 'none', stroke: solid ? 'none' : 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(key, value);
  icon.innerHTML = paths[name]; icon.style.strokeWidth = '1.8px';
  // 原生页面会把 SVG 子元素描边归零，自有线形图标需要显式恢复继承。
  for (const shape of icon.children) { const style = (shape as SVGElement).style; style.strokeWidth = 'inherit'; style.stroke = 'inherit'; style.fill = solid ? 'inherit' : 'none'; }
  return icon;
}
