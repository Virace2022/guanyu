import { start } from './core/bootstrap';

const dispose = start();

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
