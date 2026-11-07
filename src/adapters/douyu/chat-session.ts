import { unsafeWindow } from '$';
import { accountId, interrupted } from './task-request';
import { prepareChatRuntime } from './chat-runtime';
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
  let stopped = false;
  async function send(room: string, text: string, uid: string, current: () => void) {
    const abort = new AbortController(); active.add(abort);
    let frame: HTMLIFrameElement | undefined, state: Session | undefined;
    const check = () => {
      current(); if (stopped || abort.signal.aborted || accountId() !== uid) throw interrupted();
      if (state?.error) throw new Error(state.error);
    };
    try {
      let native = (unsafeWindow as any).socketProxy;
      if (String(currentRoom?.() || native?.info?.room?.roomId || '') === room) {
        // 同房新连接会挤掉当前聊天；复用原实例，保留输入草稿和其他监听。
        await waitFor(() => {
          native = (unsafeWindow as any).socketProxy;
          return String(native?.info?.room?.roomId) === room && String(native.info.user.userId) === uid && native.isSocketReady
            && native.info.barrage.isUserLogied && native.socket.GS?.isConnected
            && !(unsafeWindow.document.querySelector('.ChatSend-button')?.classList.contains('is-gray')) ? true : undefined;
        }, check, abort.signal);
        let reply: Session['reply'];
        const subscription = native.socketStream.subscribe('chatres', (event: any) => { reply = { code: String(event.res), message: event.msg || '' }; });
        try {
          check();
          const packet = unsafeWindow.JSON.parse(JSON.stringify({ type: 'chatmessage', content: text, sender: uid, dy: native.info.room.deviceID, pe: 0, col: 0, ifs: 0, nc: 0, dat: 0, rev: 0 }));
          if (!native.sendMessage(packet)) {
            // 断开时官方会缓存消息，仅撤回本次未发出的对象，避免重连后迟发。
            const queue = native.cacheMessage?.GS, index = queue?.indexOf(packet) ?? -1;
            if (index >= 0) queue.splice(index, 1);
            throw new Error('当前房间聊天连接已断开，将先核对任务再重试');
          }
          const result = await waitFor(() => reply, check, abort.signal);
          if (result.code !== '0') throw new Error(`官方未接受弹幕（res=${result.code}）${result.message ? `：${result.message}` : ''}`);
        } finally { subscription?.unsubscribe(); }
        return;
      }
      check(); const runtime = await prepareChatRuntime(abort.signal); check();
      frame = document.createElement('iframe'); frame.hidden = true; frame.dataset.guanyuChat = room; document.body.append(frame);
      const target = frame.contentDocument!, page = frame.contentWindow!;
      target.open(); page.history.replaceState(null, '', `/${room}`);
      target.write('<!doctype html><html><head></head><body></body></html>'); target.close();
      const policy = target.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
      policy.content = `default-src 'none'; script-src 'unsafe-inline' ${new URL(runtime.polyfill).origin}; connect-src 'self' wss:; worker-src 'self' blob:`;
      target.head.append(policy);
      state = { uid, room, data: runtime.data, dataRuntime: runtime.dataRuntime, socket: runtime.socket };
      (page as any).__guanyuChat = state;
      let loaded = false;
      const polyfill = target.createElement('script'); polyfill.src = runtime.polyfill;
      polyfill.onload = () => { loaded = true; }; polyfill.onerror = () => { state!.error = '官方聊天基础脚本加载失败'; };
      target.head.append(polyfill);
      await waitFor(() => loaded ? true : undefined, check, abort.signal);
      const script = target.createElement('script'); script.textContent = `${runtime.source}\n${connect}`; target.head.append(script);
      await waitFor(() => state!.loggedIn && state!.initialized && state!.proxy?.isSocketReady && state!.proxy.socket.GS?.isConnected ? true : undefined, check, abort.signal);
      if (state.initialDelay) {
        const due = Date.now() + state.initialDelay;
        await waitFor(() => Date.now() >= due ? true : undefined, check, abort.signal, state.initialDelay + 1000);
      }
      check(); state.sending = true;
      if (!state.send!(text)) throw new Error('官方聊天连接已断开，将先核对任务再重试');
      const reply = await waitFor(() => state!.reply, check, abort.signal);
      if (reply.code !== '0') throw new Error(`官方未接受弹幕（res=${reply.code}）${reply.message ? `：${reply.message}` : ''}`);
    } finally {
      // 每个房间确认发送后即关闭网关、心跳与 Worker，不等设置窗口关闭。
      try { state?.proxy?.destroy(); } finally { frame?.remove(); active.delete(abort); }
    }
  }
  return { send, cancel() { for (const abort of active) abort.abort(); }, dispose() { stopped = true; for (const abort of active) abort.abort(); } };
}
export type ChatSessions = ReturnType<typeof createChatSessions>;
