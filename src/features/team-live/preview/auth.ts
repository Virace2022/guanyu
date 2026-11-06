import { hex_md5 } from '../../../core/md5';
export function getCookieValue(name: string) {
  const entry = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
export function getDouyuRealLiveAuth(rid: string, did: string, ts: number, key: string, random: string, times: number, special: number) {
  let value = random;
  for (let index = 0; index < times; index++) value = hex_md5(value + key);
  return hex_md5(value + key + (special === 1 ? '' : `${rid}${ts}`));
}
