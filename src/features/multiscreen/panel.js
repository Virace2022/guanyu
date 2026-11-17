import { diagnostics } from '../../core/diagnostics';

export class MultiScreenPanel {
    constructor(owner) {
        this.owner = owner;
        this.frame = null;
        this.open = false;
        this.decorations = [];
        this.orders = new Map();
        this.keydown = event => {
            const card = event.target.closest('[class^="item-"][role="checkbox"]');
            if (!owner.settings.enabled || !card || !["Enter", " "].includes(event.key) || card.getAttribute("aria-disabled") === "true") return;
            event.preventDefault(); event.stopPropagation(); card.click();
        };
    }

    observe() {
        this.unobserve();
        this.domObserver = new MutationObserver(records => {
            if (records.some(record => record.type === "attributes" ? record.target === this.node
                : [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches('[class*="mutiPlayerEditPanel-"]') || node.querySelector('[class*="mutiPlayerEditPanel-"]'))))) this.schedule();
        });
        const root = document.getElementById("room-html5-player");
        if (root) this.domObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    }

    unobserve() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.domObserver?.disconnect();
    }

    schedule() {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.sync(); });
    }

    sync() {
        const owner = this.owner;
        if (!owner.settings.enabled || owner.stopped || !owner.host) { this.detach(); return; }
        const node = document.querySelector('[class*="mutiPlayerEditPanel-"]');
        if (!node) { diagnostics.report('multi.compact', 'idle', '等待打开官方选房面板：[class*="mutiPlayerEditPanel-"]'); this.detach(); return; }
        if (node !== this.node) {
            this.detach(); this.node = node;
            const bar = document.createElement("div"); bar.className = "guanyu-multi-selected";
            this.count = document.createElement("span"); this.count.className = "guanyu-multi-count";
            this.chips = document.createElement("div"); this.chips.className = "guanyu-multi-chips";
            const add = document.createElement("button"); add.type = "button"; add.className = "guanyu-multi-add-button"; add.textContent = "添加房间";
            add.addEventListener("click", event => { event.stopPropagation(); owner.ui.prompt(); });
            bar.append(this.count, this.chips, add);
            node.insertBefore(bar, node.querySelector('[class*="listPanel-"]'));
            this.bar = bar;
            this.resize = new ResizeObserver(() => this.measure()); this.resize.observe(node);
            this.wheel = event => {
                if (event.target.closest('[class*="listPanel-"]')) event.stopPropagation();
            };
            node.addEventListener("wheel", this.wheel, { passive: true });
            node.addEventListener("keydown", this.keydown);
        }
        node.classList.add("guanyu-multi-editor");
        node.classList.toggle("guanyu-multi-compact", owner.settings.compact);
        const panel = owner.native.panel(), open = Number(panel?.state.mutiPlayerEditPanelHeight) > 0;
        node.classList.toggle("guanyu-multi-open", open);
        if (open && !this.open) void owner.refresh();
        this.open = open;
        const ids = owner.native.active() ? owner.native.order() : [];
        owner.ui.render();
        this.count.textContent = `已选 ${ids.length} / ${Number(owner.native.config().webNumLimit) || 4}`;
        const signature = JSON.stringify(ids.map(id => [id, owner.rooms.rooms.get(id)?.nn]));
        if (signature !== this.signature) {
            this.signature = signature; this.chips.replaceChildren();
            for (const id of ids) {
                const name = owner.rooms.rooms.get(id)?.nn || String(id), chip = document.createElement("span"); chip.className = "guanyu-multi-chip";
                const text = document.createElement("span"); text.textContent = name; text.title = name;
                chip.appendChild(text);
                if (id === owner.native.roomId) {
                    const current = document.createElement("small"); current.textContent = "当前"; chip.appendChild(current);
                } else {
                    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.title = `取消 ${name}`;
                    remove.setAttribute("aria-label", `取消播放 ${name}`);
                    remove.addEventListener("click", event => { event.stopPropagation(); owner.native.remove(id); this.schedule(); });
                    chip.appendChild(remove);
                }
                this.chips.appendChild(chip);
            }
        }
        const allRooms = owner.native.config().battleList || [];
        const choices = allRooms.filter(room => Number(room.showStatus) === 1);
        const grid = node.querySelector('[class*="listPanel-"] > [class^="list-"]');
        const groupSignature = JSON.stringify(owner.groups);
        if (grid && (groupSignature !== this.groupSignature || this.decorations.some(item => item.parentElement !== grid))) {
            this.groupSignature = groupSignature;
            this.decorations.forEach(item => item.remove()); this.decorations = [];
            let order = 0;
            for (const group of owner.groups) {
                const title = document.createElement("div"); title.className = "guanyu-multi-group-title";
                title.toggleAttribute("data-first", order === 0);
                title.textContent = `${group.label} · ${group.rooms.length}`; title.style.order = String(order++);
                grid.append(title); this.decorations.push(title);
                for (const room of group.rooms) {
                    if (Number(room.showStatus) === 1) { order++; continue; }
                    const card = document.createElement("div"), text = document.createElement("span");
                    card.className = "guanyu-multi-offline-card"; card.style.order = String(order++);
                    card.setAttribute("aria-disabled", "true");
                    card.title = `${room.nn} · 未开播`; text.textContent = card.title;
                    if (room.roomSrcSixteen) card.style.backgroundImage = `url("${room.roomSrcSixteen.replace(/["\\\n\r]/g, "")}")`;
                    card.append(text); grid.append(card); this.decorations.push(card);
                }
            }
        }
        const orderById = new Map(); let order = 0;
        for (const group of owner.groups) { order++; for (const room of group.rooms) orderById.set(Number(room.rid), order++); }
        node.querySelectorAll('[class^="item-"]').forEach((card, index) => {
            const room = choices[index];
            if (!room) return;
            if (!this.orders.has(card)) this.orders.set(card, card.style.order);
            card.style.order = owner.settings.compact ? String(orderById.get(Number(room.rid))) : this.orders.get(card);
            card.tabIndex = 0; card.setAttribute("role", "checkbox");
            card.setAttribute("aria-label", `${room.nn}${Number(room.showStatus) === 1 ? "" : "，未开播"}`);
            card.setAttribute("aria-checked", String(ids.includes(Number(room.rid))));
            card.setAttribute("aria-disabled", String(Number(room.rid) === owner.native.roomId || Number(room.showStatus) !== 1));
        });
        for (const card of this.orders.keys()) if (!card.isConnected) this.orders.delete(card);
        this.measure();
        diagnostics.report('multi.compact', 'applied', '已匹配官方选房面板并启用紧凑布局');
    }

    measure() {
        if (!this.node?.isConnected || !this.open) return;
        const width = this.node.clientWidth - 32, columns = Math.max(1, Math.floor((width + 8) / 118));
        const cardWidth = (width - (columns - 1) * 8) / columns;
        const listHeight = this.owner.settings.compact ? cardWidth * 9 / 16 * 2 + 8 : 174;
        const properties = {
            "--guanyu-multi-list-height": `${listHeight}px`,
            "--guanyu-multi-panel-height": `${Math.min(this.owner.host.clientHeight - 4, 36 + this.bar.offsetHeight + listHeight + 16)}px`
        };
        for (const [name, value] of Object.entries(properties)) {
            if (this.node.style.getPropertyValue(name) !== value) this.node.style.setProperty(name, value);
        }
    }

    detach() {
        this.resize?.disconnect();
        if (this.node) {
            this.node.removeEventListener("wheel", this.wheel);
            this.node.removeEventListener("keydown", this.keydown);
            this.node.classList.remove("guanyu-multi-editor", "guanyu-multi-compact", "guanyu-multi-open");
            this.node.style.removeProperty("--guanyu-multi-list-height"); this.node.style.removeProperty("--guanyu-multi-panel-height");
            this.node.querySelectorAll('[role="checkbox"]').forEach(card => {
                card.removeAttribute("role"); card.removeAttribute("tabindex"); card.removeAttribute("aria-label"); card.removeAttribute("aria-checked"); card.removeAttribute("aria-disabled");
            });
        }
        this.decorations.forEach(item => item.remove()); this.decorations = [];
        for (const [card, order] of this.orders) card.style.order = order;
        this.orders.clear();
        this.bar?.remove(); this.bar = this.node = null; this.open = false; this.signature = this.groupSignature = "";
    }
}
