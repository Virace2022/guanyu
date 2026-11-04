import { unsafeWindow } from '$';
let pending;
export function loadFlv() {
  if (unsafeWindow.flvjs) return Promise.resolve(unsafeWindow.flvjs);
  if (!pending) pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(), 15000);
    const finish = () => {
      clearTimeout(timer); script.onload = script.onerror = null;
      if (unsafeWindow.flvjs) resolve(unsafeWindow.flvjs);
      else { script.remove(); reject(new Error('FLV 预览组件加载失败')); }
    };
    script.src = 'https://registry.npmmirror.com/flv.js/1.6.2/files/dist/flv.min.js';
    script.onload = script.onerror = finish; document.head.append(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
