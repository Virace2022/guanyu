import { start } from './core/bootstrap';
import { diagnostics } from './core/diagnostics';
import { version } from './core/version';
import { mountErrorNotices } from './ui/error-notices';

diagnostics.start(version);
const removeErrorNotices = mountErrorNotices();
let dispose: () => void;
try { dispose = start(); }
catch (cause) { diagnostics.failure('启动', cause); throw cause; }

if (import.meta.hot) {
  import.meta.hot.dispose(() => { dispose?.(); removeErrorNotices(); window.removeEventListener('pagehide', onPageHide); });
}
function onPageHide(event: PageTransitionEvent) {
  if (!event.persisted) { removeErrorNotices(); window.removeEventListener('pagehide', onPageHide); }
}
window.addEventListener('pagehide', onPageHide);
