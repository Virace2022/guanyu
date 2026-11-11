import { unsafeWindow } from '$';

const credentialNames = ['acf_uid', 'acf_biz', 'acf_stk', 'acf_ct', 'acf_ltkid'];
let rejectedToken = '';

interface AccountPage extends Window {
  socketProxy?: { info?: { user?: { userId?: string | number }; barrage?: { isUserLogied?: boolean } } };
}

export function cookie(name: string) {
  const value = document.cookie.split('; ').find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  return decodeURIComponent(value);
}

export const accountId = () => cookie('acf_uid');
export const accountToken = () => credentialNames.map(cookie).join('_');

export function accountReady() {
  const values = credentialNames.map(cookie);
  if (values.some(value => !value) || values.join('_') === rejectedToken) return false;
  const page = unsafeWindow as unknown as AccountPage | undefined;
  if (!/^\/(?:\d|beta\/|topic\/)/.test(page?.location?.pathname || '')) return true;
  const info = page?.socketProxy?.info;
  // 聊天只提供启动就绪信号，服务端明确返回未登录时仍须暂停。
  return !!info?.barrage?.isUserLogied && String(info.user?.userId || '') === values[0];
}

export function retryAccount() { rejectedToken = ''; }

export function requireAccount() {
  if (!accountReady()) throw Object.assign(new Error('等待斗鱼登录就绪；观鱼不会自动登录或刷新页面'), { loginRequired: true });
}

export function observeAccountResponse(result: any, token: string) {
  if ((result?.error == null || Number(result.error) === 0) && (result?.status_code == null || Number(result.status_code) === 200)) return;
  if (!/未登录|请(?:先|重新)?登录|登录(?:状态)?(?:已)?(?:过期|失效)/.test(String(result.message || result.msg || ''))) return;
  // 迟到的旧请求不能暂停已恢复的新凭据；拒绝状态只留在本页内存。
  if (token === accountToken()) rejectedToken = token;
}
