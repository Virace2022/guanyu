import { unsafeWindow } from '$';
import { diagnostics } from '../../core/diagnostics';
export class MultiScreenNative {
    constructor() {
        this.control = null;
        this.service = null;
        this.core = null;
    }

    component(node, accepts) {
        if (!node) return null;
        for (const element of [node, ...node.querySelectorAll("*")]) {
            const key = Object.keys(element).find(name => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
            let fiber = element[key], root = fiber;
            while (root?.return) root = root.return;
            if (root?.stateNode?.current === root?.alternate && fiber?.alternate) fiber = fiber.alternate;
            for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) {
                if (fiber.stateNode && accepts(fiber.stateNode)) return fiber.stateNode;
            }
        }
        return null;
    }

    connect() {
        this.control = this.component(document.getElementById("js-player-controlbar"), value => typeof value.listenMultiScreenStart === "function");
        if (!this.control) { diagnostics.report('multi.service', 'unmatched', document.getElementById('js-player-controlbar') ? '未找到带 listenMultiScreenStart 的官方控制栏组件' : '未找到 #js-player-controlbar'); return false; }
        if (!this.service) {
            const queue = unsafeWindow.sharkLivePlayerJsonp;
            if (!Array.isArray(queue) || queue.push === Array.prototype.push) { diagnostics.report('multi.service', 'waiting', '官方 sharkLivePlayerJsonp 运行时尚未安装'); return false; }
            let runtime;
            const id = `guanyu-multi-${Date.now()}`;
            // 使用页面自己的 Webpack 运行时取得已加载模块，避免固定模块编号或依赖调试器。
            queue.push([[id], { [id]: (module, exports, require) => { runtime = require; } }, [[id]]]);
            if (!runtime?.c) { diagnostics.report('multi.service', 'unmatched', '未取得官方 Webpack 模块缓存 runtime.c'); return false; }
            delete runtime.m[id]; delete runtime.c[id];
            for (const [moduleId, module] of Object.entries(runtime.c)) {
                const source = runtime.m[moduleId]?.toString() || "";
                const value = module.exports;
                if (source.includes("gethandleByType") && source.includes("msgCallback") && value?.d?.emit) this.core = value;
                // 先识别多屏模块再读取导出，其他模块可能导出跨源 Window，不能遍历其属性。
                if (!source.includes("changeMultiRoomList") || !source.includes("setBattleList") || !value) continue;
                for (const item of [value, ...Object.values(value)]) {
                    if (typeof item?.changeMultiRoomList === "function" && typeof item?.setBattleList === "function") this.service = item;
                }
            }
        }
        const ready = !!this.service && !!this.core && this.roomId > 0 && Number(this.service.currentRoomId) === this.roomId;
        diagnostics.report('multi.service', ready ? 'ready' : 'unmatched', !this.service ? '未发现带 changeMultiRoomList / setBattleList 的官方多屏服务' : !this.core ? '未发现官方事件与状态服务 gethandleByType / msgCallback' : !ready ? '控制栏房间号与多屏服务 currentRoomId 尚未一致' : '已识别官方多屏控制器、名单服务和状态服务');
        return ready;
    }

    get container() { return document.getElementById("js-player-multiContainer"); }
    get roomId() { return Number(this.control?.props.rid); }
    get store() { return this.core.k(); }

    config() {
        return this.store.getState().getIn(["controller", "multiscreen"])?.toJS() || {};
    }

    own(config = this.config()) { return config.battleId === "guanyu-local"; }

    active() { return !!this.config().switch; }

    order() {
        const ids = (this.service.activeRoomList || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
        return ids.length ? ids : [this.roomId];
    }

    panel() {
        return this.component(document.querySelector('[class*="mutiPlayerEditPanel-"]'), value => typeof value.handleSelectBtnClick === "function");
    }

    apply(rooms, base) {
        let config = base || this.config();
        if (!base && (!config.state || config.state === "end")) {
            this.control.listenMultiScreenStart({
                rid: this.roomId, state: "start", endPoint: "3", webNumLimit: "4", popupType: "2",
                battleId: "guanyu-local", confId: 0, testFlag: true, isTcp: true, battleList: rooms
            });
            config = this.config();
        }
        // 原生默认深合并数组，缩短名单会留下旧项；setPath 在同一次派发内替换整个名单。
        this.store.dispatch({
            type: "controller/updateMultiscreen", setPath: [["controller", "multiscreen", "battleList"]],
            data: { controller: { multiscreen: { ...config, battleList: rooms } } }
        });
        this.service.setBattleList(rooms);
        this.core.d.emit("multiScreenRoomList", { multiScreenRoomList: rooms });
    }

    syncPanel() {
        this.panel()?.updateMultiScreenRoomList();
    }

    remove(id) {
        const ids = this.order();
        if (id === this.roomId || !ids.includes(id)) return;
        if (ids.length <= 2) {
            this.exit();
            return;
        } else this.service.changeMultiRoomList("delete", id);
        this.syncPanel();
    }

    exit() {
        if (!this.active()) return;
        this.control.closeMutiPlayer();
        this.service.historyRoomList = [this.roomId];
        this.syncPanel();
    }

    replace(oldId, newId) {
        const ids = this.order(), index = ids.indexOf(oldId);
        if (!this.active() || index < 0 || oldId === this.roomId) throw new Error("原分屏已变化，请重新右键选择画面。");
        if (ids.includes(newId)) throw new Error("这个直播间已在当前多屏中。");
        ids[index] = newId;
        // fresh 复用未变槽位的 React key，只销毁并创建更换房间的那一路播放器。
        this.service.changeMultiRoomList("fresh", ids);
        this.syncPanel();
    }

    target(event) {
        if (!this.active() || this.service.$dragBox) return null;
        const index = this.service.queryCurrentBox(event);
        const id = this.order()[index - 1];
        return id && id !== this.roomId ? id : null;
    }

    end() {
        if (this.own()) this.control.listenMultiScreenEnd();
    }
}
