export class MultiScreenRooms {
    constructor() {
        this.rooms = new Map();
        this.following = [];
        this.temporary = new Set();
        this.requests = new Set();
    }

    async request(url) {
        const abort = new AbortController();
        this.requests.add(abort);
        const timer = setTimeout(() => abort.abort(), 15000);
        try {
            const response = await fetch(url, { credentials: "include", signal: abort.signal });
            if (!response.ok) throw new Error(`房间资料请求失败（HTTP ${response.status}）`);
            return await response.json();
        } finally { clearTimeout(timer); this.requests.delete(abort); }
    }

    remember(room) {
        const id = Number(room.rid);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        const saved = { ...this.rooms.get(id), ...room, rid: id };
        this.rooms.set(id, saved);
        return saved;
    }

    async info(ids) {
        const unique = [...new Set(ids.map(Number))].filter(id => Number.isSafeInteger(id) && id > 0);
        const found = [];
        for (let index = 0; index < unique.length; index += 50) {
            const result = await this.request(`/japi/carnival/c/roomInfo/getRoomInfo?roomIds=${unique.slice(index, index + 50).join(",")}`);
            if (result.error !== 0 || !Array.isArray(result.data)) throw new Error("未能取得直播间资料，请稍后重试。");
            for (const room of result.data) {
                const value = this.remember({
                    rid: room.RoomID, nn: room.NickName, avt: room.AvatarSMall || room.Avatar,
                    roomSrcSixteen: room.RoomSrcSixteen, hot: String(room.Hot || 0), showStatus: Number(room.ShowStatus) === 1 ? "1" : "2"
                });
                if (value) found.push(value);
            }
        }
        return found;
    }

    async follow() {
        const ids = [];
        let page = 1, pages = 1;
        do {
            const result = await this.request(`/wgapi/livenc/liveweb/follow/list?sort=1&cid1=0&page=${page}`);
            if (result.error !== 0 || !Array.isArray(result.data?.list)) throw new Error("关注名单未能读取，仍可添加自定义房间。");
            for (const room of result.data.list) {
                const value = this.remember({
                    rid: room.room_id, nn: room.nickname, avt: room.avatar_small, roomSrcSixteen: room.room_src,
                    hot: String(MultiScreen_hot(room.online)), showStatus: Number(room.show_status) === 1 && Number(room.videoLoop) === 0 ? "1" : "2"
                });
                if (value) ids.push(value.rid);
            }
            pages = Math.max(1, Number(result.data.pageCount) || 1);
            page++;
        } while (page <= pages);
        this.following = [...new Set(ids)];
        return this.following;
    }

    async resolve(input) {
        let value = input.trim();
        if (!/^\d+$/.test(value)) {
            let url;
            try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
            catch { throw new Error("请输入有效的斗鱼房间号或直播间链接。"); }
            if (!/(^|\.)douyu\.com$/i.test(url.hostname)) throw new Error("请输入斗鱼直播间链接。");
            value = url.pathname.match(/^\/(\d+)\/?$/)?.[1] || (url.pathname.startsWith("/topic/") && url.searchParams.get("rid")) || "";
        }
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error("请输入有效的斗鱼房间号。");
        const rooms = await this.info([Number(value)]);
        if (rooms.length !== 1) throw new Error("没有找到这个直播间，请检查房间号。");
        return rooms[0];
    }

    close() { for (const request of this.requests) request.abort(); this.requests.clear(); }
}

function MultiScreen_hot(value) {
    const text = String(value || "0"), count = parseFloat(text) || 0;
    return Math.round(count * (text.includes("亿") ? 100000000 : text.includes("万") ? 10000 : 1));
}
