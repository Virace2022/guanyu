import { diagnostics } from '../../core/diagnostics';

export function reportMatches(id: string, selectors: string, empty: string) {
  const found = !!document.querySelector(selectors);
  diagnostics.report(id, found ? 'applied' : 'unmatched', found ? `已匹配 ${selectors}` : `${empty}；选择器：${selectors}`);
}

export function reportStyleMatches(id: string, style: HTMLStyleElement, prefix: string, empty: string) {
  if (!style.sheet) { diagnostics.report(id, 'error', '增强样式未挂载到页面'); return; }
  const selectors = [...style.sheet.cssRules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .filter(rule => rule.style.display === 'none' || rule.style.visibility === 'hidden')
    .flatMap(rule => splitSelectors(rule.selectorText)).filter(selector => selector.startsWith(prefix)).join(', ');
  if (selectors) reportMatches(id, selectors, empty);
  else diagnostics.report(id, 'error', `增强样式中未找到 ${prefix} 对应的隐藏规则`);
}

function splitSelectors(value: string) {
  const selectors: string[] = [];
  let start = 0, depth = 0, quote = '';
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (char === '\\') { index++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) { selectors.push(value.slice(start, index).trim()); start = index + 1; }
  }
  selectors.push(value.slice(start).trim());
  return selectors;
}
