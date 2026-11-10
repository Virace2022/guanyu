import { assertResponse, accountId, cookie, confirmedResult, type TaskRequest } from './task-request';

export interface TaskRoom { id: string; name: string; live: boolean }
export interface LevelTask { taskId: number; taskType: number; name: string; taskStatus: number; prizeStatus: number; cur: number; max: number }
export interface Post { id: string; groupId: string }
export interface FanChatTask { id: number; cur: number; max: number; done: boolean }

export function createDouyuTasks(http: TaskRequest) {
  const request = http.request;
  async function get(path: string) {
    const result = await request(path); assertResponse(result); return result.data;
  }
  async function post(path: string, data: Record<string, string | number> = {}) {
    const result = await request(path, { method: 'POST', data: new URLSearchParams({ ctn: cookie('acf_ccn') || cookie('ccn'), ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])) }).toString() });
    assertResponse(result); return result;
  }
  async function followPage(page: number) {
    const data = await get(`/wgapi/livenc/liveweb/follow/list?sort=1&cid1=0&page=${page}`);
    if (!Array.isArray(data?.list) || !Number.isInteger(Number(data.pageCount))) throw new Error('关注名单格式异常');
    return { pages: Math.max(1, Number(data.pageCount)), rooms: data.list.map((room: any): TaskRoom => ({
      id: String(room.room_id), name: String(room.nickname || room.room_id), live: Number(room.show_status) === 1 && Number(room.videoLoop) === 0,
    })) };
  }
  async function followed() {
    const rooms: TaskRoom[] = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const data = await followPage(page); pages = data.pages; rooms.push(...data.rooms);
    }
    return rooms;
  }
  async function badges(): Promise<TaskRoom[]> {
    const html = await request('/member/cp/getFansBadgeList', { text: true });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector('.fans-badge-list')) throw new Error('粉丝牌名单未能读取，请检查登录状态');
    const rooms = new Map<string, TaskRoom>();
    for (const node of doc.querySelectorAll<HTMLElement>('[data-fans-room]')) {
      const id = node.dataset.fansRoom || '';
      if (/^\d+$/.test(id)) rooms.set(id, { id, name: node.textContent?.trim().split(/\s+/)[0] || id, live: false });
    }
    return [...rooms.values()];
  }
  async function level(roomId: string): Promise<LevelTask[]> {
    const detail = await get(`/japi/interactnc/web/userLevel/userLevelDetail?rid=${roomId}`);
    if (!Array.isArray(detail?.taskIds)) throw new Error('官方等级任务编号未能读取');
    if (!detail.taskIds.length) return [];
    const data = await get(`/japi/tasksys/userLevelTask/getTaskStatus?taskIds=${detail.taskIds.join(',')}`);
    if (!Array.isArray(data?.list)) throw new Error('官方等级任务状态格式异常');
    return data.list;
  }
  async function fanChatTask(roomId: string): Promise<FanChatTask | null> {
    const result = await request(`/japi/interactnc/web/fans/userTaskList?rid=${roomId}&uid=${encodeURIComponent(accountId())}`, { sameOrigin: true });
    assertResponse(result);
    if (!Array.isArray(result.data?.dayTasks)) throw new Error('官方粉丝牌任务格式异常');
    const task = result.data.dayTasks.find((item: any) => Number(item.taskType) === 1);
    if (!task) return null;
    const cur = Number(task.taskNum), max = Number(task.taskTotal);
    if (!Number.isInteger(cur) || cur < 0 || !Number.isInteger(max) || max < 1) throw new Error('官方弹幕任务进度异常');
    return { id: Number(task.taskId), cur, max, done: cur >= max };
  }
  async function posts(): Promise<Post[]> {
    const first = await request('/wbapi/web/group/myFollow?page=1&limit=30'); assertResponse(first);
    if (!Array.isArray(first.data?.list)) throw new Error('关注鱼吧列表格式异常');
    const page = Math.floor(Math.random() * Math.max(1, Number(first.data.count_page) || 1)) + 1;
    const groups = page === 1 ? first : await request(`/wbapi/web/group/myFollow?page=${page}&limit=30`);
    assertResponse(groups);
    let ids = (groups.data?.list || []).map((group: any) => String(group.group_id)).filter((id: string) => /^\d+$/.test(id));
    if (!ids.length) {
      const hot = await request('https://yuba.douyu.com/wgapi/yubanc/api/feed/getHotRecFeedList?offset=0&limit=30'); assertResponse(hot);
      ids = [...new Set((hot.data?.feed_list || []).map((feed: any) => String(feed.group?.group_id || '')).filter((id: string) => /^\d+$/.test(id)))];
    }
    if (!ids.length) throw new Error('没有读取到可供随机阅读的真实鱼吧');
    const groupId = ids[Math.floor(Math.random() * ids.length)];
    const result = await request(`/wbapi/web/group/postlist?group_id=${groupId}&page=1&sort=1`); assertResponse(result);
    if (!Array.isArray(result.data)) throw new Error('鱼吧文章列表格式异常');
    // 新版 feed_id 与文章 post_id 不同，等级阅读沿用真实文章编号，不能直接拿动态编号请求。
    return result.data.map((post: any) => ({ id: String(post.post_id), groupId })).filter((post: Post) => /^\d+$/.test(post.id));
  }
  async function readPost(post: Post) {
    const result = await request(`/wbapi/web/post/detail/${post.id}?cid=&timestamp=${Date.now()}`); assertResponse(result);
    if (String(result.data?.post_id) !== post.id) throw new Error('鱼吧接口未返回对应文章');
    return String(result.data.title || post.id);
  }
  async function starConfig() {
    const data = await get('/japi/livebiz/cdn/anchorstardiscover/config');
    if (!Array.isArray(data?.userTaskConfig?.userTasks)) throw new Error('星推官方任务配置未能读取');
    const now = Date.now() / 1000;
    if (Number(data.baseConfig?.mainSwitch) !== 1 || now < Number(data.baseConfig.startTime) || now > Number(data.baseConfig.endTime)) return null;
    return data;
  }
  async function starRooms(roomId: string): Promise<TaskRoom[]> {
    const data = await get(`/japi/livebiznc/web/anchorstardiscover/rank/info?rid=${roomId}&type=5&track=3`);
    if (!Array.isArray(data?.rankItemList)) throw new Error('星推房间名单未能读取');
    return data.rankItemList.map((room: any) => ({ id: String(room.rid), name: String(room.anchorName || room.rid), live: Number(room.showStatus) === 1 }));
  }
  async function pointsSign() {
    const alias = '20250521OPFOY_qd2';
    const statusPath = `/japi/carnivalApi/nc/sign/getStatus?signAlias=${alias}`;
    const readStatus = async () => { const result = await request(statusPath, { sameOrigin: true }); assertResponse(result); return result.data; };
    const status = await readStatus();
    if (Number(status?.todaySigned) === 1) return 'already';
    if (Number(status?.todayTaskFinished) !== 1) throw new Error('官方任务中心的今日签到条件尚未完成');
    if (!cookie('cvl_csrf_token')) assertResponse(await request('/japi/carnival/nc/common/generateCsrf', { method: 'POST', sameOrigin: true }));
    const csrfToken = cookie('cvl_csrf_token');
    if (!csrfToken) throw new Error('官方签到凭据未能生成');
    const result = await request('/japi/carnivalApi/sign/doSign', { method: 'POST', sameOrigin: true, data: new URLSearchParams({ csrfToken, signAlias: alias, useJiYan: 'true' }).toString() });
    if (![0, 31200, 31015].includes(Number(result.error))) assertResponse(result);
    const after = await readStatus();
    if (Number(after?.todaySigned) !== 1) throw new Error('官方任务中心未确认今日签到');
    return Number(result.error) === 31015 ? 'already' : 'signed';
  }
  async function viewRewards() {
    const centerPost = async (path: string, data: Record<string, string | number> = {}) => {
      const result = await request(path, { method: 'POST', sameOrigin: true,
        data: new URLSearchParams({ ctn: cookie('acf_ccn') || cookie('ccn'), actAlias: '20250521OPFOY', ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])) }).toString() });
      assertResponse(result); return result.data;
    };
    const status = await centerPost('/wgapi/activitync/gametask/viewStatus');
    if (!status?.taskList || !Number.isFinite(Number(status.startTime))) throw new Error('官方观时积分状态格式异常');
    const claimed: string[] = [];
    for (const [id, task] of Object.entries(status.taskList)) {
      if (Number((task as any).status) !== 2) continue;
      await centerPost('/wgapi/activitync/gametask/takeGift', { id, startTime: status.startTime });
      claimed.push(id);
    }
    if (claimed.length) {
      const after = await centerPost('/wgapi/activitync/gametask/viewStatus');
      if (Number(after?.startTime) !== Number(status.startTime) || claimed.some(id => Number(after?.taskList?.[id]?.status) !== 3)) throw new Error('官方尚未确认全部观时积分已领取，将按最新状态重试');
    }
    return claimed.length;
  }
  return {
    request, get, post, followPage, followed, badges, level, fanChatTask, posts, readPost, starConfig, starRooms, pointsSign, viewRewards,
    async signFansHome(id: string) {
      const result = await request('/japi/interactnc/web/fanshome/sign', { method: 'POST',
        data: new URLSearchParams({ ctn: cookie('acf_ccn') || cookie('ccn'), rid: id }).toString() });
      return confirmedResult(result);
    },
    follow: (id: string) => post('/wgapi/livenc/liveweb/follow/add', { rid: id }),
    unfollow: (id: string) => post('/wgapi/livenc/liveweb/follow/rm', { rid: id }),
    levelPrize: (roomId: string, taskId: number) => post('/japi/tasksys/userLevelTask/getPrize', { roomId, taskIds: taskId }),
    async starSign(id: string) {
      const result = await request('/japi/livebiznc/web/anchorstardiscover/user/task/report', { method: 'POST', data: new URLSearchParams({ rid: id, type: '5', ctn: cookie('acf_ccn') }).toString() });
      if (Number(result.error) === 12012 && result.msg === '用户今日已签到') return 'already';
      return confirmedResult(result);
    },
  };
}
export type DouyuTasks = ReturnType<typeof createDouyuTasks>;
