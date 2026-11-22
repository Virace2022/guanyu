import { unsafeWindow } from '$';
import { preferFirstStreamQuality } from './adapters/douyu/first-stream-quality';
import { start } from './core/bootstrap';
import { diagnostics } from './core/diagnostics';
import { version } from './core/version';
import { mountErrorNotices } from './ui/error-notices';

const firstStreamQuality = preferFirstStreamQuality(unsafeWindow);
let dispose: (() => void) | undefined, removeErrorNotices: (() => void) | undefined;
let startupTimer: number | undefined;

function initialize() {
  diagnostics.start(version);
  removeErrorNotices = mountErrorNotices();
  try { dispose = start(firstStreamQuality); }
  catch (cause) { diagnostics.failure('启动', cause); throw cause; }
}

function startAfterDomReady() { startupTimer = window.setTimeout(initialize, 0); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAfterDomReady, { once: true });
else startAfterDomReady();

function releaseStartup() {
  document.removeEventListener('DOMContentLoaded', startAfterDomReady);
  window.clearTimeout(startupTimer);
  firstStreamQuality?.dispose();
  removeErrorNotices?.();
  window.removeEventListener('pagehide', onPageHide);
}
if (import.meta.hot) {
  import.meta.hot.dispose(() => { dispose?.(); releaseStartup(); });
}
function onPageHide(event: PageTransitionEvent) { if (!event.persisted) releaseStartup(); }
window.addEventListener('pagehide', onPageHide);
