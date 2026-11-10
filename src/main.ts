import { start } from './core/bootstrap';
import { diagnostics } from './core/diagnostics';
import { version } from './core/version';

diagnostics.start(version);
let dispose: () => void;
try { dispose = start(); }
catch (cause) { diagnostics.failure('启动', cause); throw cause; }

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
