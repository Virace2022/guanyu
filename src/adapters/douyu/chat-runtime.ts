import { unsafeWindow } from '$';
import { interrupted } from './task-request';

interface Runtime { m: Record<string, Function>; c: Record<string, { exports: any }>; p: string }
export interface ChatRuntime { source: string; polyfill: string; data: string; dataRuntime: string; socket: string }
const recipeKey = 'guanyu:chat-runtime:v1';
let prepared: Promise<ChatRuntime> | undefined;
const assetUrl = /^https:\/\/shark\d*\.douyucdn\.cn\/front-publish\/(?:dynamic-polyfill-master\/|live-master\/lib\/(?:playerSDK|vendor|sdk)-room_|live-next-master\/js\/room\/common_)/;

// 只执行聊天依赖闭包，模块编号和 DLL 名称均取自本页官方运行时。
const loader = String.raw`function(modules,path){
  const cache={};
  function require(id){
    if(cache[id])return cache[id].exports;
    if(!modules[id])throw new Error('官方聊天依赖缺失：'+id);
    const module=cache[id]={exports:{}};
    modules[id](module,module.exports,require);return module.exports;
  }
  require.m=modules;require.c=cache;require.p=path;
  require.o=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
  require.d=(obj,key,get)=>{if(!require.o(obj,key))Object.defineProperty(obj,key,{enumerable:true,get})};
  require.r=obj=>Object.defineProperty(obj,'__esModule',{value:true});
  require.n=obj=>{const get=obj&&obj.__esModule?()=>obj.default:()=>obj;require.d(get,'a',get);return get};
  require.t=(obj,mode)=>{
    if(mode&1)obj=require(obj);if(mode&8)return obj;
    if(mode&4&&obj&&typeof obj==='object'&&obj.__esModule)return obj;
    const ns={default:obj};require.r(ns);
    if(mode&2&&typeof obj!=='string')for(const key in obj)require.d(ns,key,()=>obj[key]);return ns;
  };
  require.e=()=>Promise.reject(new Error('后台聊天不加载页面模块'));
  return require;
}`;

function assets(target: Window) {
  return Array.from(target.document.scripts, script => script.src).filter(url => assetUrl.test(url));
}

export function rememberChatRuntime() {
  const urls = assets(unsafeWindow as unknown as Window);
  if (!urls.some(url => url.includes('/room/common_')) || !urls.some(url => url.includes('/sdk-room_'))) return;
  const value = JSON.stringify(urls);
  // 资源清单只是个人中心接手时的缓存，写入失败不阻止当前直播页执行任务。
  try { if (localStorage.getItem(recipeKey) !== value) localStorage.setItem(recipeKey, value); } catch { /* 当前页仍可直接发现官方模块。 */ }
}

function collect(target: Window, urls: string[]): ChatRuntime {
  const roots = new Map<string, Runtime>();
  for (const name of Object.getOwnPropertyNames(target)) {
    const value = Object.getOwnPropertyDescriptor(target, name)?.value;
    if (typeof value === 'function' && value.m && value.c) roots.set(name, value);
  }
  const main = roots.get('_room_common_');
  const socket = main && Object.entries(main.m).find(([, factory]) => {
    const source = factory.toString();
    return source.includes('function SocketCore(') && source.includes('socketInit:');
  })?.[0];
  const dataEntry = [...roots].flatMap(([name, root]) => Object.entries(root.m).filter(([, factory]) => {
    const source = factory.toString(); return source.includes('"DataCenter"') && source.includes('"SocketData"');
  }).map(([id]) => ({ name, id })))[0];
  const polyfill = urls.find(url => url.includes('/dynamic-polyfill-master/'));
  if (!main || !socket || !dataEntry || !polyfill) throw new Error('官方聊天运行时尚未就绪');
  const queue: [string, string][] = [['_room_common_', socket], [dataEntry.name, dataEntry.id]];
  const groups = new Map<string, Map<string, string>>();
  while (queue.length) {
    const [name, id] = queue.pop()!, root = roots.get(name)!;
    let group = groups.get(name);
    if (!group) groups.set(name, group = new Map());
    if (group.has(id)) continue;
    const source = root.m[id]?.toString();
    if (!source) throw new Error('官方聊天模块缺失');
    group.set(id, source);
    const requireName = source.slice(source.indexOf('(') + 1, source.indexOf(')')).split(',')[2]?.trim();
    if (!requireName) continue;
    for (const quote of ['"', "'"]) for (const tail of source.split(`${requireName}(${quote}`).slice(1)) {
      const end = tail.indexOf(quote), dependency = tail.slice(0, end);
      // 只接收本运行时存在的依赖，排除 error("…") 等同后缀调用。
      if (!root.m[dependency]) continue;
      queue.push([name, dependency]);
      const suffix = tail.slice(end + 1);
      if (!suffix.startsWith(`)(${quote}`)) continue;
      const external = root.m[dependency]!.toString().split('.exports=')[1]?.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/)?.[0];
      if (external && roots.has(external)) queue.push([external, suffix.slice(3).split(quote)[0]!]);
    }
  }
  const source = [...groups].map(([name, modules]) =>
    `window[${JSON.stringify(name)}]=(${loader})({${[...modules].map(([id, code]) => `${JSON.stringify(id)}:${code}`).join(',')}},${JSON.stringify(roots.get(name)!.p || '')});`).join('\n');
  return { source, polyfill, data: dataEntry.id, dataRuntime: dataEntry.name, socket };
}

function loadScript(target: Document, url: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const script = target.createElement('script'); script.src = url;
    const finish = (error?: Error) => {
      clearTimeout(timer); signal.removeEventListener('abort', stop);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const stop = () => finish(interrupted());
    const timer = setTimeout(() => finish(new Error('官方聊天基础脚本加载超时')), 20000);
    script.onload = () => finish(); script.onerror = () => finish(new Error('官方聊天基础脚本加载失败'));
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) { stop(); return; }
    target.head.append(script);
  });
}

async function prepare(signal: AbortSignal): Promise<ChatRuntime> {
  const page = unsafeWindow as unknown as Window;
  const urls = assets(page);
  if ((page as any)._room_common_) {
    const runtime = collect(page, urls);
    rememberChatRuntime();
    return runtime;
  }
  const saved: unknown = JSON.parse(localStorage.getItem(recipeKey) || 'null');
  if (!Array.isArray(saved) || !saved.length) throw new Error('请先打开一个直播间，等待官方聊天服务就绪');
  const frame = document.createElement('iframe'); frame.hidden = true; frame.dataset.guanyuChat = 'runtime'; document.body.append(frame);
  try {
    const target = frame.contentDocument!;
    // 个人中心的调度页只载入共享库；这些库的入口仅导出模块加载器，不挂载页面。
    for (const url of saved) {
      if (typeof url !== 'string' || !assetUrl.test(url)) throw new Error('官方聊天资源清单无效');
      await loadScript(target, url, signal);
    }
    return collect(frame.contentWindow!, saved);
  } finally { frame.remove(); }
}

export function prepareChatRuntime(signal: AbortSignal) {
  if (!prepared) {
    const attempt = prepare(signal); prepared = attempt;
    void attempt.catch(() => { if (prepared === attempt) prepared = undefined; });
  }
  return prepared;
}
