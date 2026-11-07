import { unsafeWindow } from '$';
import { TeamLiveStreamSource } from './stream-source';
import { TeamLiveFocus } from './focus';
import { element as TeamLive_element, button as TeamLive_button } from './dom';
import { loadFlv } from './libraries';
import { teamColumns } from '../layout';
export class TeamLiveMonitor {
    constructor(page) {
        this.page = page;
        this.tiles = new Set();
        this.queue = [];
        this.loading = 0;
        this.library = null;
        this.flv = null;
        this.loadFlv = loadFlv;
        this.sources = new TeamLiveStreamSource(this);
        this.tileNodes = new WeakMap();
        this.focus = new TeamLiveFocus(this);
        this.visibility = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const tile = this.tileNodes.get(entry.target);
                if (tile && this.tiles.has(tile)) tile.visible = entry.isIntersecting;
            }
            this.sync();
        });
        this.onVisibility = () => { if (document.hidden) this.focus.restoreAll(); this.sync(); };
        document.addEventListener("visibilitychange", this.onVisibility);

    }

    previewTeams(layout) {
        return layout.enabled ? layout.previewGroups : [{ name: "全部成员", initial: Array.from(this.page.rooms.keys()), remaining: [] }];
    }

    previewIds(layout) {
        return this.previewTeams(layout).flatMap(team => [...team.initial, ...(layout.enabled && layout.previewMembers ? team.remaining : [])]).filter(Boolean);
    }

    mount(container, layout) {
        this.board = TeamLive_element("section", "guanyu-preview");
        this.board.setAttribute("aria-label", "预览（娱乐功能）");
        this.board.appendChild(TeamLive_element("h3", "guanyu-preview-heading", "预览（娱乐功能）"));
        this.groups = TeamLive_element("div", "guanyu-preview-teams");
        this.board.appendChild(this.groups);
        for (const team of this.previewTeams(layout)) this.mountTeam(team, layout);
        if (!this.previewIds(layout).length) this.board.appendChild(TeamLive_element("p", "guanyu-preview-empty-note", "当前没有可预览成员，请先编排名单。"));
        container.appendChild(this.board);
        this.arrange(layout);
    }

    mountTeam(team, layout) {
        const group = TeamLive_element("div", `guanyu-preview-team${team.independent ? ' guanyu-preview-independent' : ''}`);
        if (team.name) {
            const heading = TeamLive_element("h4", "guanyu-preview-group-title", team.name);
            if (team.color) { heading.classList.add("guanyu-team-colored-title"); heading.style.setProperty("--guanyu-team-color", team.color); }
            group.appendChild(heading);
        }
        this.mountRow(group, team.initial, "captains", layout);
        if (layout.enabled && layout.previewMembers && team.remaining.length) this.mountRow(group, team.remaining, "members", layout);
        this.groups.appendChild(group);
    }

    mountRow(group, slots, role, layout) {
        const row = TeamLive_element("div", "guanyu-preview-row"); row.dataset.role = role;
        const total = role === "members" && layout.keepEmpty && layout.columns ? Math.ceil(slots.length / layout.columns) * layout.columns : slots.length;
        for (let index = 0; index < total; index++) {
            const id = slots[index];
            if (id) row.appendChild(this.createTile(id, row));
            else {
                const empty = TeamLive_element("div", "guanyu-preview-tile guanyu-preview-empty");
                empty.append(TeamLive_element("div", "guanyu-preview-screen", "空"), TeamLive_element("div", "guanyu-preview-name", "\u00a0"));
                empty.setAttribute("aria-hidden", "true"); row.appendChild(empty);
            }
        }
        group.appendChild(row);
    }

    updateMembers(layout) {
        if (!this.groups || !layout.enabled) return;
        this.focus.restoreAll();
        Array.from(this.groups.children).forEach((group, index) => {
            const row = group.querySelector('[data-role="members"]');
            if (!layout.previewMembers && row) {
                for (const tile of this.tiles) if (row.contains(tile.node)) {
                    this.release(tile); this.visibility.unobserve(tile.node); this.tileNodes.delete(tile.node); this.tiles.delete(tile);
                }
                row.remove();
            } else if (layout.previewMembers && !row && this.previewTeams(layout)[index].remaining.length) this.mountRow(group, this.previewTeams(layout)[index].remaining, "members", layout);
        });
        this.queue = this.queue.filter(({ tile }) => this.tiles.has(tile));
        this.arrange(layout); this.sync();
    }

    arrange(layout) {
        if (!this.groups) return;
        const teams = this.previewTeams(layout), width = this.groups.clientWidth;
        const columns = layout.enabled ? teamColumns(teams.filter(team => !team.independent).length, width, layout.teamColumns) : 1;
        this.groups.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        Array.from(this.groups.children).forEach((group, index) => {
            const available = group.clientWidth || width / columns;
            const preferred = layout.enabled ? layout.previewMembers ? layout.columns || Math.floor(available / 100) : Math.max(1, teams[index]?.initial.length || 1) : Math.floor(available / 130);
            group.style.setProperty("--guanyu-preview-columns", String(Math.max(1, Math.min(preferred, Math.floor(available / 100) || 1))));
        });
    }

    createTile(id, row) {
        const node = TeamLive_element("div", "guanyu-preview-tile"); node.dataset.roomId = id;
        const screen = TeamLive_element("div", "guanyu-preview-screen");
        const name = this.page.rooms.get(id)?.name || id;
        const caption = TeamLive_element("div", "guanyu-preview-name", name); caption.title = name;
        node.append(screen, caption);
        if (String(id) === String(this.page.roomId)) {
            node.dataset.state = "current";
            screen.appendChild(TeamLive_element("span", "guanyu-preview-status", "本直播间"));
            return node;
        }
        const video = document.createElement("video");
        video.muted = video.defaultMuted = true; video.volume = 0;
        video.autoplay = video.playsInline = true;
        video.disablePictureInPicture = video.disableRemotePlayback = true;
        video.setAttribute("aria-label", `${name}静音预览`);
        const status = TeamLive_element("span", "guanyu-preview-status", "等待预览…");
        const retry = TeamLive_button("重试", () => {
            if (tile.state === "blocked") this.play(tile, tile.token);
            else this.retry(tile);
        }, "guanyu-preview-retry"); retry.hidden = true;
        screen.append(video, status, retry);
        const tile = { id, row, node, video, screen, status, retry, token: 0, state: "idle", visible: false, hls: null, flv: null, lowestSupported: null, originalFailed: false, audible: false, request: null, timer: null, renewTimer: null, retryTimer: null, renewFailures: 0 };
        this.focus.bind(tile);
        this.tiles.add(tile);
        this.tileNodes.set(node, tile); this.visibility.observe(node);
        return node;
    }

    sync() {
        for (const tile of this.tiles) {
            if (document.hidden || this.page.fullscreen || !tile.visible || this.focus.suppressed(tile)) {
                if (tile.state !== "paused") {
                    this.release(tile);
                    this.message(tile, "paused", document.hidden ? "后台已暂停" : this.page.fullscreen ? "全屏已暂停" : this.focus.suppressed(tile) ? "放大其他预览时已暂停" : "屏幕外已暂停");
                }
                continue;
            }
            if (tile.state === "paused") tile.state = "idle";
            if (this.page.statuses.get(tile.id) === false) {
                if (tile.state !== "offline") { this.release(tile); this.message(tile, "offline", "未开播"); }
            } else if (tile.state === "idle" || tile.state === "offline") {
                tile.state = "idle"; this.enqueue(tile);
            }
        }
        this.queue = this.queue.filter(({ tile, token }) => this.valid(tile, token));
    }

    enqueue(tile) {
        if (!this.valid(tile, tile.token) || tile.state !== "idle") return;
        this.message(tile, "queued", "等待预览…");
        this.queue.push({ tile, token: tile.token }); this.pump();
    }

    pump() {
        while (this.loading < 4 && this.queue.length) {
            const { tile, token, renew } = this.queue.shift();
            if (!this.valid(tile, token) || (!renew && tile.state !== "queued")) continue;
            this.loading++;
            (renew ? this.renew(tile, token) : this.start(tile, token)).finally(() => { this.loading--; this.pump(); });
        }
    }

    valid(tile, token) {
        return this.tiles.has(tile) && tile.token === token && tile.node.isConnected && tile.visible && !document.hidden && !this.page.fullscreen && !this.focus.suppressed(tile);
    }

    loadLibrary() {
        if (unsafeWindow.Hls) return Promise.resolve(unsafeWindow.Hls);
        if (!this.library) this.library = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            const timer = setTimeout(() => finish(), 15000);
            const finish = () => {
                clearTimeout(timer); script.onload = script.onerror = null;
                if (unsafeWindow.Hls) resolve(unsafeWindow.Hls);
                else reject(new Error("预览组件加载失败"));
            };
            script.src = "https://sta-op.douyucdn.cn/front-publish/sdk-file-master/hls_14b7ec8.js";
            script.onload = script.onerror = finish;
            document.head.appendChild(script);
        }).catch(error => { this.library = null; throw error; });
        return this.library;
    }

    async start(tile, token) {
        this.message(tile, "loading", "正在加载…");
        try {
            const source = await this.sources.get(tile, token);
            if (!this.valid(tile, token)) return;
            tile.request = null;
            tile.node.dataset.source = source.mode || (source.kind === "flv" ? "lowest" : "native");
            tile.audible = source.hasAudio === true && this.focus.original(tile);
            const video = tile.video;
            video.setAttribute("aria-label", `${this.page.rooms.get(tile.id)?.name || tile.id}${tile.audible ? "原声" : "静音"}预览`);
            video.onloadedmetadata = () => {
                if (this.valid(tile, token)) tile.node.title = `${source.mode === "original" ? "高清原声直播流" : source.kind === "flv" ? "低画质直播流" : "原生预览"} · ${video.videoWidth}×${video.videoHeight}`;
            };
            video.onplaying = () => {
                if (!this.valid(tile, token)) return;
                clearTimeout(tile.timer); tile.timer = null; this.message(tile, "playing", "");
            };
            video.onwaiting = () => {
                if (!this.valid(tile, token)) return;
                this.message(tile, "loading", "缓冲中…"); this.deadline(tile, token);
            };
            video.onerror = () => { if (this.valid(tile, token)) this.fail(tile); };
            video.onended = () => { if (this.valid(tile, token)) this.fail(tile, "预览已结束"); };
            this.deadline(tile, token);
            if (source.kind === "flv") {
                const player = this.flv.createPlayer({ type: "flv", isLive: true, hasAudio: source.hasAudio === true, url: source.url }, {
                    enableStashBuffer: false, lazyLoad: false, autoCleanupSourceBuffer: true,
                    autoCleanupMaxBackwardDuration: 15, autoCleanupMinBackwardDuration: 5
                });
                tile.flv = player;
                player.on(this.flv.Events.ERROR, () => { if (this.valid(tile, token)) this.fail(tile); });
                player.attachMediaElement(video); player.load(); this.play(tile, token);
                return;
            }
            const Hls = await this.loadLibrary();
            if (!this.valid(tile, token)) return;
            this.scheduleRenew(tile, token, source.url);
            if (Hls.isSupported()) {
                const hls = new Hls({ maxBufferLength: 10, maxMaxBufferLength: 20, maxBufferSize: 8 * 1024 * 1024 });
                tile.hls = hls;
                hls.on(Hls.Events.MANIFEST_PARSED, () => this.play(tile, token));
                hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && this.valid(tile, token)) this.fail(tile); });
                hls.loadSource(source.url); hls.attachMedia(video);
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = source.url; this.play(tile, token);
            } else this.fail(tile, "浏览器不支持预览");
        } catch (error) {
            if (this.valid(tile, token)) this.fail(tile, ["预览组件加载失败", "未开播"].includes(error.message) ? error.message : "预览暂时不可用");
        }
    }

    scheduleRenew(tile, token, url) {
        clearTimeout(tile.renewTimer);
        // 原生预览 URL 的 txTime 约一分钟到期，不能一直复用 hover 时取得的地址。
        const expires = parseInt(new URL(url).searchParams.get("txTime"), 16) * 1000;
        const delay = Math.max(5000, Math.min(45000, Number.isFinite(expires) ? expires - Date.now() - 15000 : 45000));
        tile.renewTimer = setTimeout(() => {
            if (!this.valid(tile, token) || ["error", "offline", "blocked"].includes(tile.state)) return;
            this.queue.push({ tile, token, renew: true }); this.pump();
        }, delay + Math.random() * 2000);
    }

    async renew(tile, token) {
        try {
            const { url } = await this.sources.get(tile, token);
            if (!this.valid(tile, token)) return;
            tile.request = null; tile.renewFailures = 0;
            this.scheduleRenew(tile, token, url);
            this.message(tile, "loading", "缓冲中…"); this.deadline(tile, token);
            if (tile.hls) {
                tile.hls.detachMedia(); tile.hls.loadSource(url); tile.hls.attachMedia(tile.video);
            } else { tile.video.src = url; this.play(tile, token); }
        } catch (error) {
            if (!this.valid(tile, token)) return;
            if (error.message === "未开播" || ++tile.renewFailures >= 3) { this.fail(tile, error.message === "未开播" ? "未开播" : "预览暂时不可用"); return; }
            tile.renewTimer = setTimeout(() => {
                if (this.valid(tile, token)) { this.queue.push({ tile, token, renew: true }); this.pump(); }
            }, 5000);
        }
    }

    deadline(tile, token) {
        if (tile.timer) return;
        tile.timer = setTimeout(() => { if (this.valid(tile, token)) this.fail(tile); }, 25000);
    }

    play(tile, token) {
        if (!this.valid(tile, token)) return;
        tile.video.muted = !(tile.audible && this.focus.original(tile)); tile.video.volume = tile.video.muted ? 0 : 1;
        Promise.resolve(tile.video.play()).catch(() => {
            if (!this.valid(tile, token)) return;
            if (tile.node.dataset.source === "original") { this.fail(tile); return; }
            clearTimeout(tile.timer); tile.timer = null; this.message(tile, "blocked", "点击播放");
        });
    }

    message(tile, state, text) {
        tile.state = state; tile.node.dataset.state = state;
        tile.status.textContent = text; tile.status.hidden = !text;
        tile.retry.hidden = !["error", "blocked"].includes(state);
        tile.retry.textContent = state === "blocked" ? "播放" : "重试";
        this.focus.stateChanged(tile, state);
    }

    restart(tile) {
        this.release(tile); delete tile.node.dataset.source; tile.state = "idle";
    }

    retry(tile) {
        if (!this.valid(tile, tile.token)) return;
        this.release(tile); tile.lowestSupported = null; tile.renewFailures = 0;
        delete tile.node.dataset.source;
        tile.state = "idle"; this.enqueue(tile);
    }

    scheduleRetry(tile) {
        const seconds = this.page.owner.layout.previewRetrySeconds;
        if (!seconds || !this.valid(tile, tile.token)) return;
        const token = tile.token;
        tile.retry.title = `每 ${seconds < 60 ? `${seconds} 秒` : `${seconds / 60} 分钟`}自动重试，也可点击立即重试`;
        tile.retryTimer = setTimeout(() => {
            tile.retryTimer = null;
            if (tile.state === "error" && this.valid(tile, token)) this.retry(tile);
        }, seconds * 1000);
    }

    fail(tile, text = "预览暂时不可用") {
        const ended = ["未开播", "预览已结束"].includes(text);
        const original = !ended && tile.node.dataset.source === "original" && this.focus.original(tile) && this.valid(tile, tile.token);
        const fallback = !ended && tile.node.dataset.source === "lowest" && tile.lowestSupported !== false && this.valid(tile, tile.token);
        this.release(tile);
        if (original) { tile.originalFailed = true; tile.state = "idle"; this.enqueue(tile); }
        else if (fallback) { tile.lowestSupported = false; tile.state = "idle"; tile.node.dataset.source = "native"; this.enqueue(tile); }
        else {
            this.message(tile, "error", text);
            tile.retry.title = "立即重试";
            if (text !== "浏览器不支持预览") this.scheduleRetry(tile);
        }
    }

    release(tile) {
        tile.token++;
        tile.audible = false; tile.video.muted = true; tile.video.volume = 0;
        clearTimeout(tile.timer); tile.timer = null;
        clearTimeout(tile.renewTimer); tile.renewTimer = null;
        clearTimeout(tile.retryTimer); tile.retryTimer = null;
        tile.video.onplaying = tile.video.onwaiting = tile.video.onerror = tile.video.onended = tile.video.onloadedmetadata = null;
        tile.request?.abort(); tile.request = null;
        tile.hls?.destroy(); tile.hls = null;
        tile.flv?.destroy(); tile.flv = null;
        tile.video.pause(); tile.video.removeAttribute("src"); tile.video.load();
    }

    dispose() {
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.clear();
    }

    clear() {
        this.visibility.disconnect();
        this.queue = [];
        this.focus.restoreAll(false);
        for (const tile of this.tiles) this.release(tile);
        this.tiles.clear();
        this.board = this.groups = null;
    }
}
