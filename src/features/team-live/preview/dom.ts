export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
export function button(text: string, action: () => void, className = '') {
  const node = element('button', className, text); node.type = 'button'; node.onclick = action; return node;
}
