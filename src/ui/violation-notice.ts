import type { Readable } from '../core/state';
import type { PlayerStore } from '../adapters/douyu/player';
import type { ViolationNotice } from '../features/playback/violation';
import styles from './violation-notice.css?style';

export function mountViolationNotice(player: PlayerStore, state: Readable<ViolationNotice | null>) {
  const style = styles.cloneNode(true);
  document.head.append(style);
  const card = document.createElement('aside'); card.className = 'guanyu-violation-notice';
  card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
  const heading = document.createElement('strong'); heading.textContent = '当前直播间违规整改中';
  const reason = document.createElement('p'), score = document.createElement('p');
  score.className = 'guanyu-violation-score'; card.append(heading, reason, score);
  let value: ViolationNotice | null = null;
  function sync() {
    const host = document.getElementById('__h5player');
    if (!value?.active || !host) { card.remove(); return; }
    reason.textContent = `违规原因：${value.reason ?? '官方未提供'}`;
    score.textContent = value.deduction === null ? '扣分信息：官方未提供' : value.deduction === 0 ? '本次未扣分' : `本次扣分：${value.deduction} 分`;
    card.title = value.content;
    if (card.parentElement !== host) host.append(card);
  }
  const stopState = state.subscribe(next => { value = next; sync(); });
  const stopPlayer = player.subscribe(sync);
  return () => { stopState(); stopPlayer(); card.remove(); style.parentNode?.removeChild(style); };
}
