import { unsafeWindow } from '$';
import { accountId, interrupted } from './task-request';
import { prepareChatRuntime } from './chat-runtime';
import { chatRoomChannel, chatRoomLock } from './chat-priority';
import { yieldToPage } from '../../core/background-work';
export { rememberChatRuntime } from './chat-runtime';

const connect = String.raw`(()=>{
  const state=window.__guanyuChat;
  try{
    const data=window[state.dataRuntime](state.data).DataCenter;
    data.setGlobalData({},{$ROOM:{room_id:Number(state.room),h5wsproxy:[]},$SYS:{cookie_pre:'acf_',h5_pieces_url:'//pslice.douyucdn.cn'},USER_INFO:{uid:state.uid}});
    const api=window._room_common_(state.socket).default;
    const proxy=state.proxy=api.socketProxy;
    data.global.set('douyuDid',proxy.info.room.deviceID);
    state.initialized=false;state.loggedIn=false;
    const send=proxy.sendMessage;
    proxy.sendMessage=function(message,...args){
      const result=send.call(this,message,...args);
      if(message.type==='lsigreq'&&result){state.authenticated=true;state.initialized=!!state.hasInit}
      return result;
    };
    // 官方 STT 编码器检查对象构造器，消息必须在任务 iframe 内创建。
    state.send=content=>proxy.sendMessage({type:'chatmessage',content,sender:state.uid,dy:proxy.info.room.deviceID,pe:0,col:0,ifs:0,nc:0,dat:0,rev:0});
    api.socketStream.subscribe('loginres',event=>{if(event.ST==='GS')state.loggedIn=String(event.userid)===state.uid});
    api.socketStream.subscribe('initcl',event=>{state.hasInit=true;state.initialized=!!state.authenticated;state.initialDelay=Number(event.fcd)||0});
    api.socketStream.subscribe('error',event=>{state.error='官方聊天连接失败（code='+event.code+'）'});
    api.socketStream.subscribe('chatres',event=>{if(state.sending)state.reply={code:String(event.res),message:event.msg||''}});
    api.socketInit();
  }catch(error){state.error=error.message||String(error)}
})()`;

interface Session {
  uid: string; room: string; data: string; dataRuntime: string; socket: string; error?: string;
  proxy?: any; loggedIn?: boolean; initialized?: boolean; initialDelay?: number;
  sending?: boolean; reply?: { code: string; message: string };
  send?: (text: string) => boolean;
}

function waitFor<T>(read: () => T | undefined, check: () => void, signal: AbortSignal, timeout = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const end = Date.now() + timeout;
    const finish = (error?: unknown, result?: T) => {
      clearTimeout(timer); signal.removeEventListener('abort', stop);
      if (error) reject(error); else resolve(result!);
    };
    const stop = () => finish(interrupted());
    const poll = () => {
      try {
        if (signal.aborted) throw interrupted();
        check(); const result = read();
        if (result !== undefined) { finish(undefined, result); return; }
        if (Date.now() >= end) throw new Error('官方聊天连接或发送确认超时，将先核对任务再重试');
        timer = setTimeout(poll, 100);
      } catch (cause) { finish(cause); }
    };
    signal.addEventListener('abort', stop, { once: true }); poll();
  });
}

export function createChatSessions(currentRoom?: () => string) {
  const active = new Set<AbortController>();
  let runtime = new AbortController();
  let stopped = false;
  function isCurrentRoom(room: string) {
    return currentRoom?.() === room || String((unsafeWindow as any).socketProxy?.info?.room?.roomId) === room;
  }
  async function send(room: string, text: string, uid: string, current: () => void): Promise<boolean> {
    if (isCurrentRoom(room)) return false;
    const abort = new AbortController();
    const channel = new BroadcastChannel(chatRoomChannel);
    let viewing = false;
    channel.onmessage = event => {
      if (event.data !== room) return;
      viewing = true;
      abort.abort();
    };
    active.add(abort);
    try {
      return await navigator.locks.request(chatRoomLock(room), { ifAvailable: true }, async lock => {
        if (!lock || viewing || isCurrentRoom(room)) return false;
        await sendInFrame(room, text, uid, current, abort.signal);
        return true;
      });
    } catch (error) {
      if (viewing || isCurrentRoom(room)) return false;
      if (abort.signal.aborted) throw interrupted();
      throw error;
    } finally { channel.close(); active.delete(abort); }
  }

  async function sendInFrame(room: string, text: string, uid: string, current: () => void, signal: AbortSignal) {
    let frame: HTMLIFrameElement | undefined, state: Session | undefined;
    const check = () => {
      current(); if (stopped || signal.aborted || accountId() !== uid || isCurrentRoom(room)) throw interrupted();
      if (state?.error) throw new Error(state.error);
    };
    try {
      await yieldToPage(signal);
      check(); const recipe = await prepareChatRuntime(runtime.signal); check();
      frame = document.createElement('iframe'); frame.hidden = true; frame.dataset.guanyuChat = room; document.body.append(frame);
      const target = frame.contentDocument!, page = frame.contentWindow!;
      target.open(); page.history.replaceState(null, '', `/${room}`);
      target.write('<!doctype html><html><head></head><body></body></html>'); target.close();
      const policy = target.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
      policy.content = `default-src 'none'; script-src 'unsafe-inline' ${new URL(recipe.polyfill).origin}; connect-src 'self' wss:; worker-src 'self' blob:`;
      target.head.append(policy);
      state = { uid, room, data: recipe.data, dataRuntime: recipe.dataRuntime, socket: recipe.socket };
      (page as any).__guanyuChat = state;
      let loaded = false;
      const polyfill = target.createElement('script'); polyfill.src = recipe.polyfill;
      polyfill.onload = () => { loaded = true; }; polyfill.onerror = () => { state!.error = '官方聊天基础脚本加载失败'; };
      target.head.append(polyfill);
      await waitFor(() => loaded ? true : undefined, check, signal);
      await yieldToPage(signal); check();
      const script = target.createElement('script'); script.textContent = `${recipe.source}\n${connect}`; target.head.append(script);
      await waitFor(() => state!.loggedIn && state!.initialized && state!.proxy?.isSocketReady && state!.proxy.socket.GS?.isConnected ? true : undefined, check, signal);
      if (state.initialDelay) {
        const due = Date.now() + state.initialDelay;
        await waitFor(() => Date.now() >= due ? true : undefined, check, signal, state.initialDelay + 1000);
      }
      check(); state.sending = true;
      if (!state.send!(text)) throw new Error('官方聊天连接已断开，将先核对任务再重试');
      const reply = await waitFor(() => state!.reply, check, signal);
      if (reply.code !== '0') throw new Error(`官方未接受弹幕（res=${reply.code}）${reply.message ? `：${reply.message}` : ''}`);
    } finally {
      // 每个房间确认发送后即关闭网关、心跳与 Worker，不等设置窗口关闭。
      try { state?.proxy?.destroy(); } finally { frame?.remove(); }
    }
  }
  function cancel() {
    for (const abort of active) abort.abort();
    runtime.abort();
    runtime = new AbortController();
  }
  return { send, cancel, dispose() { stopped = true; cancel(); } };
}
export type ChatSessions = ReturnType<typeof createChatSessions>;
