import { element as TeamLive_element } from './dom';
export class TeamLiveFocus {
    constructor(monitor) {
        this.monitor = monitor;
        this.groups = new Map();
    }

    selected(tile) { return this.groups.get(tile.row.parentElement)?.tile === tile; }

    original(tile) {
        return this.selected(tile) && this.monitor.page.owner.layout.previewFocusOriginal && !tile.originalFailed;
    }

    suppressed(tile) {
        const focused = this.groups.get(tile.row.parentElement);
        return !!focused && tile.row === focused.target && focused.tile !== tile;
    }

    available(tile) {
        return tile.state === "playing" && this.monitor.valid(tile, tile.token)
            && this.monitor.page.statuses.get(tile.id) !== false && !tile.video.paused && !tile.video.ended && tile.video.readyState >= 2;
    }

    bind(tile) {
        tile.screen.addEventListener("dblclick", event => {
            if (event.button !== 0 || event.target.closest("button")) return;
            if (this.toggle(tile)) { event.preventDefault(); event.stopPropagation(); }
        });
        tile.screen.addEventListener("keydown", event => {
            if (event.target !== tile.screen || !["Enter", " ", "Escape"].includes(event.key)) return;
            if (event.key === "Escape" && !this.selected(tile)) return;
            if (this.toggle(tile)) { event.preventDefault(); event.stopPropagation(); }
        });
    }

    update(tile) {
        const selected = this.selected(tile), enabled = selected || this.available(tile);
        tile.screen.classList.toggle("guanyu-preview-zoomable", enabled);
        tile.screen.title = enabled ? selected ? "双击还原预览" : "双击放大预览" : "";
        tile.screen.tabIndex = enabled ? 0 : -1;
        if (enabled) {
            tile.screen.setAttribute("role", "button");
            tile.screen.setAttribute("aria-label", `${this.monitor.page.rooms.get(tile.id)?.name || tile.id}，${tile.screen.title}`);
            tile.screen.setAttribute("aria-pressed", String(selected));
        } else {
            tile.screen.removeAttribute("role"); tile.screen.removeAttribute("aria-label"); tile.screen.removeAttribute("aria-pressed");
        }
    }

    placeholder(tile, caption) {
        const node = TeamLive_element("div", "guanyu-preview-tile");
        const screen = TeamLive_element("div", "guanyu-preview-screen");
        if (caption) {
            screen.appendChild(TeamLive_element("span", "guanyu-preview-status", "正在放大预览"));
            screen.title = "双击还原预览";
            screen.addEventListener("dblclick", event => {
                if (event.button !== 0 || !this.selected(tile)) return;
                event.preventDefault(); event.stopPropagation(); this.toggle(tile);
            });
        } else node.setAttribute("aria-hidden", "true");
        node.append(screen, TeamLive_element("div", "guanyu-preview-name", caption || "\u00a0"));
        return node;
    }

    toggle(tile) {
        const group = tile.row.parentElement;
        if (this.selected(tile)) this.restore(group);
        else {
            if (!this.available(tile)) return false;
            this.restore(group);
            let target = group.querySelector('[data-role="members"]');
            const temporary = !target;
            if (!target) {
                target = TeamLive_element("div", "guanyu-preview-row"); target.dataset.role = "members";
                group.appendChild(target);
            }
            let spacer = null;
            if (!target.children.length && target !== tile.row) {
                spacer = this.placeholder(tile); spacer.classList.add("guanyu-preview-focus-spacer"); target.appendChild(spacer);
            }
            const captain = tile.row.dataset.role === "captains";
            const placeholder = this.placeholder(tile, captain ? this.monitor.page.rooms.get(tile.id)?.name || tile.id : "");
            tile.row.insertBefore(placeholder, tile.node);
            this.groups.set(group, { tile, target, placeholder, spacer, temporary });
            tile.originalFailed = false;
            target.classList.add("guanyu-preview-row-focused");
            tile.node.classList.add("guanyu-preview-focused");
            if (captain) target.appendChild(tile.node);
            if (this.original(tile)) this.monitor.restart(tile);
            this.update(tile);
        }
        this.monitor.sync();
        this.monitor.page.updateHeight?.();
        return true;
    }

    restore(group, restart = true) {
        const focused = this.groups.get(group);
        if (!focused) return;
        const { tile, target, placeholder, spacer, temporary } = focused;
        const switchSource = this.original(tile) || tile.node.dataset.source === "original";
        this.groups.delete(group);
        tile.video.muted = true; tile.video.volume = 0; tile.audible = false;
        placeholder.replaceWith(tile.node);
        target.classList.remove("guanyu-preview-row-focused");
        tile.node.classList.remove("guanyu-preview-focused");
        spacer?.remove();
        if (temporary) target.remove();
        tile.originalFailed = false;
        if (restart && switchSource) this.monitor.restart(tile);
        this.update(tile);
        this.monitor.page.updateHeight?.();
    }

    restoreAll(restart = true) {
        for (const group of this.groups.keys()) this.restore(group, restart);
    }

    stateChanged(tile, state) {
        if (this.selected(tile) && ["error", "blocked", "offline", "paused"].includes(state)) {
            this.restore(tile.row.parentElement, false); queueMicrotask(() => this.monitor.sync());
        }
        this.update(tile);
    }
}
