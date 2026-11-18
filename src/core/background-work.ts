type BackgroundScheduler = { postTask(callback: () => void, options: { priority: 'background'; signal?: AbortSignal }): Promise<void> };

export function afterPageLoad(signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout>;
    function finish(ready: boolean) {
      clearTimeout(timer);
      window.removeEventListener('load', onLoad);
      signal.removeEventListener('abort', onAbort);
      resolve(ready);
    }
    function onLoad() {
      clearTimeout(timer);
      timer = setTimeout(() => finish(true), 450);
    }
    function onAbort() { finish(false); }
    if (signal.aborted) { resolve(false); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    if (document.readyState === 'complete') onLoad();
    else {
      window.addEventListener('load', onLoad, { once: true });
      timer = setTimeout(() => finish(true), 2000);
    }
  });
}

export function yieldToPage(signal?: AbortSignal): Promise<void> {
  const scheduler = (globalThis as { scheduler?: BackgroundScheduler }).scheduler;
  if (scheduler) return scheduler.postTask(() => {}, { priority: 'background', signal });
  return new Promise<void>(resolve => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve());
    else setTimeout(resolve, 0);
  }).then(() => signal?.throwIfAborted());
}
