import { MultiScreenNative } from '../../adapters/douyu/multiscreen';
import { MultiScreenRooms } from './rooms';
import { MultiScreenPanel } from './panel';
export class MultiScreenController {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.settings = dependencies.settings();
        this.rooms = new MultiScreenRooms();
        this.native = new MultiScreenNative();
        this.ui = dependencies.ui;
        this.panel = new MultiScreenPanel(this);
        this.official = null;
        this.applying = false;
        this.lastRefresh = 0;
        this.signature = "";
        this.teamSignature = "";
        this.pending = null;
        this.revision = 0;
        this.stopped = false;
    }

    start() {
        this.ui.mount();
        this.connect();
        this.timer = setInterval(() => this.connect(), 2000);
        this.onVisibility = () => { if (!document.hidden) { this.connect(); void this.refresh(); } };
        document.addEventListener("visibilitychange", this.onVisibility);
    }

    connect() {
        if (this.stopped || document.hidden) return;
        if (this.host && (!this.host.isConnected || this.roomId !== this.native.roomId)) this.disconnect();
        if (!this.host) {
            if (!this.native.connect()) return;
            this.roomId = this.native.roomId;
            this.host = this.native.container;
            this.official = this.native.own() || this.native.config().state !== "start" ? null : this.native.config();
            this.unsubscribe = this.native.store.subscribe(() => this.changed());
            this.officialListListener = event => {
                const config = this.native.config();
                if (this.applying || this.native.own(config) || config.state !== "start" || !Array.isArray(event.multiScreenRoomList)) return;
                this.official = { ...config, battleList: event.multiScreenRoomList };
                this.signature = ""; this.rebuild();
            };
            this.native.core.d.on("multiScreenRoomList", this.officialListListener);
            this.observer = new MutationObserver(() => this.panel.schedule());
            if (this.settings.enabled) {
                this.observer.observe(this.host, { childList: true });
                this.panel.observe();
            }
            this.changed();
            void this.refresh(true);
        }
        const page = this.dependencies.teamPage();
        const signature = page?.activity ? `${page.activity}:${Array.from(page.rooms.keys()).join(",")}` : "";
        if (signature !== this.teamSignature) {
            this.teamSignature = signature;
            this.lastRefresh = 0;
            void this.refresh();
        }
        this.panel.schedule();
    }

    changed() {
        const value = this.native.store.getState().getIn(["controller", "multiscreen"]);
        if (value !== this.configValue) {
            this.configValue = value;
            if (!this.applying && value) {
                const config = value.toJS();
                if (!this.native.own(config)) {
                    const supplied = this.official?.battleId === config.battleId && JSON.stringify((config.battleList || []).map(room => Number(room.rid))) === this.appliedRooms;
                    this.official = config.state === "start" ? { ...config, battleList: supplied ? this.official.battleList : config.battleList } : null;
                    this.signature = "";
                    this.rebuild();
                }
            }
        }
        this.panel.schedule();
    }

    teamRooms() {
        const page = this.dependencies.teamPage();
        if (!page?.activity) return [];
        return Array.from(page.rooms.values()).map(room => ({
            rid: Number(room.id), nn: room.name, showStatus: (page.statuses.get(room.id) ?? room.live) ? "1" : "2"
        }));
    }

    async refresh(force = false) {
        if (!this.host || !this.settings.enabled || this.stopped) return;
        if (this.pending) return this.pending;
        if (!force && Date.now() - this.lastRefresh < 60000) { this.rebuild(); return; }
        const roomId = this.roomId, revision = this.revision;
        const pending = (async () => {
            this.ui.status("正在更新候选直播间…");
            let warning = "";
            try {
                const team = this.teamRooms();
                for (const room of this.official?.battleList || team) this.rooms.remember(room);
                if (!this.official && !team.length && this.settings.useFollow) {
                    try { await this.rooms.follow(); }
                    catch (error) { warning = error.message; }
                }
                if (revision !== this.revision) return;
                const ids = [roomId, ...team.map(room => room.rid), ...this.settings.custom, ...this.rooms.temporary, ...this.native.order()];
                await this.rooms.info(ids);
                if (this.stopped || this.roomId !== roomId || revision !== this.revision || !this.settings.enabled) return;
                this.lastRefresh = Date.now();
                this.rebuild();
                this.ui.status(warning || "候选名单已更新，当前画面与排列保持不变。");
            } catch (error) {
                if (!this.stopped && this.roomId === roomId && revision === this.revision && this.settings.enabled) {
                    this.rebuild();
                    this.ui.status(error.name === "AbortError" ? "房间资料请求已取消或超时，可点击刷新重试。" : error.message);
                }
            } finally { this.ui.render(); }
        })().finally(() => { if (this.pending === pending) this.pending = null; });
        this.pending = pending;
        return this.pending;
    }

    rebuild() {
        if (!this.host || !this.settings.enabled || this.stopped || !this.rooms.rooms.has(this.roomId)) return;
        const team = this.teamRooms();
        const base = this.official?.battleList || (team.length ? team : this.settings.useFollow ? this.rooms.following.map(id => this.rooms.rooms.get(id)).filter(Boolean) : []);
        for (const room of this.official?.battleList || []) this.rooms.remember(room);
        const ids = [...new Set([this.roomId, ...base.map(room => Number(room.rid)), ...this.settings.custom, ...this.rooms.temporary, ...this.native.order()])].filter(id => Number.isSafeInteger(id) && id > 0);
        const rooms = ids.map(id => this.rooms.rooms.get(id) || { rid: id, nn: `房间 ${id}`, showStatus: "2", avt: "", roomSrcSixteen: "", hot: "0" });
        const signature = JSON.stringify([this.official?.battleId || "local", rooms]);
        if (signature !== this.signature) {
            this.applying = true;
            try { this.native.apply(rooms, this.official); this.signature = signature; this.appliedRooms = JSON.stringify(ids); }
            finally { this.applying = false; }
        }
        this.panel.schedule(); this.ui.render();
    }

    configure(next) {
        const previous = this.settings;
        this.settings = next;
        if (previous.enabled === next.enabled && previous.useFollow === next.useFollow && JSON.stringify(previous.custom) === JSON.stringify(next.custom)) {
            this.panel.schedule(); this.ui.render(); return;
        }
        this.revision++;
        this.rooms.close(); this.pending = null;
        if (!next.enabled) {
            this.restoreNative();
            this.signature = "";
            this.panel.detach(); this.panel.unobserve(); this.observer?.disconnect();
            this.ui.status("多屏增强已关闭。");
        } else {
            this.signature = "";
            this.lastRefresh = 0;
            if (!previous.enabled) {
                if (this.host) {
                    this.observer.observe(this.host, { childList: true }); this.panel.observe();
                } else this.connect();
            }
            void this.refresh(true);
            this.panel.schedule();
        }
        this.ui.render();
    }

    save(next) {
        try { this.dependencies.save(next); }
        catch { throw new Error("多屏设置未能保存，请检查浏览器存储空间。"); }
        this.configure(next);
    }

    /**
     * @param {string} input 房间号或链接
     * @param {boolean} save 是否保存为常用候选
     * @param {number|null} oldId 要替换的副屏房间
     */
    async add(input, save, oldId = null) {
        const native = this.native;
        const room = await this.rooms.resolve(input);
        if (oldId !== null) {
            if (!this.settings.enabled || !this.host || native !== this.native) throw new Error("当前直播间已变化或增强已关闭，请重新选择分屏。");
            if (this.native.order().includes(room.rid)) throw new Error("这个直播间已在当前多屏中。");
        }
        if (save) {
            const next = { ...this.settings, custom: [...new Set([...this.settings.custom, room.rid])] };
            try { this.dependencies.save(next); }
            catch { throw new Error("自定义房间未能保存，请检查浏览器存储空间。"); }
            this.settings = next;
        } else this.rooms.temporary.add(room.rid);
        this.signature = ""; this.rebuild();
        if (oldId !== null) this.native.replace(oldId, room.rid);
        this.panel.schedule(); this.ui.render();
        return room;
    }

    disconnect() {
        this.revision++;
        this.unsubscribe?.(); this.unsubscribe = null;
        if (this.officialListListener) this.native.core.d.off("multiScreenRoomList", this.officialListListener);
        this.officialListListener = null;
        this.observer?.disconnect();
        this.panel.detach(); this.panel.unobserve();
        this.rooms.close();
        this.rooms.temporary.clear();
        this.host = null; this.official = null; this.configValue = null; this.signature = ""; this.appliedRooms = ""; this.lastRefresh = 0; this.pending = null;
        this.native = new MultiScreenNative();
    }

    restoreNative() {
        if (!this.host) return;
        this.applying = true;
        try {
            if (this.native.own()) this.native.end();
            else if (this.official) this.native.apply(this.official.battleList, this.official);
        } finally { this.applying = false; }
    }


    close() {
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.stopped = true;
        clearInterval(this.timer);
        this.restoreNative();
        this.disconnect();
    }
}
