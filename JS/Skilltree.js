(function(){
    "use strict";

    // ---------- CONSTANTS & GLOBALS ----------
    const ELEMENTS = ["Neutral", "Fire", "Ice", "Lightning", "Nature", "Weird", "Physical", "Wind"];

    // Non-neutral elements arranged in a ring — neighbours are "adjacent" (available at 2× cost)
    const ELEMENT_RING = ["Fire", "Ice", "Lightning", "Nature", "Weird", "Physical", "Wind"];

    // Accent colours used for element badges and node tinting
    const ELEMENT_COLORS = {
        Fire:      "#e05a2b",
        Ice:       "#5bc4e8",
        Lightning: "#f0d84a",
        Nature:    "#5cb85c",
        Weird:     "#a862d6",
        Physical:  "#e87b2a",
        Wind:      "#7ec8e3",
        Neutral:   "#8899cc"
    };

    const SVG_NS = "http://www.w3.org/2000/svg";

    // DOM elements
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.id = "treeSvg";
    svg.style.display = "block";
    svg.style.transformOrigin = "center center";

    const fileInput        = document.getElementById("fileInput");
    const saveTreeBtn      = document.getElementById("saveTreeBtn");
    const progressInput    = document.getElementById("progressInput");
    const saveProgressBtn  = document.getElementById("saveProgressBtn");
    const resetBtn         = document.getElementById("resetBtn");
    const pointsInfo       = document.getElementById("pointsInfo");
    const msgEl            = document.getElementById("msg");
    const toggleOverviewBtn= document.getElementById("toggleOverviewBtn");
    const zoomInBtn        = document.getElementById("zoomInBtn");
    const zoomOutBtn       = document.getElementById("zoomOutBtn");
    const addPointBtn      = document.getElementById("addPointBtn");
    const subPointBtn      = document.getElementById("subPointBtn");
    const overviewPanel    = document.getElementById("overviewPanel");
    const overviewList     = document.getElementById("overviewList");

    // State
    let tree            = null;
    let unlocked        = new Map();   // Map<elementName: string, Set<nodeId: string>>
    let pointsLeft      = 0;
    let primaryElement  = null;        // player's chosen primary element (null until chosen)
    let selectedElement = "Neutral";   // which element variant is currently displayed

    const baseNodeLabels = new Map();

    // ---------- INJECTED STYLES ----------
    // Adds CSS for the new element picker modal and tab buttons.
    // Called once at startup so the HTML file needs no changes.
    function injectStyles() {
        if (document.getElementById("skilltree-extra-styles")) return;
        const style = document.createElement("style");
        style.id = "skilltree-extra-styles";
        style.textContent = `
            /* --- Element picker modal --- */
            .elem-picker-modal { max-width: 520px; }
            .elem-picker-modal h2 { margin-bottom: 8px; }
            .elem-picker-modal .pick-subtitle {
                font-size: 0.88em; color: #aab0d0; margin-bottom: 16px;
            }
            .element-grid {
                display: flex; flex-wrap: wrap; gap: 10px;
                justify-content: center; margin: 16px 0;
            }
            .elem-pick-btn {
                padding: 10px 18px; border-radius: 8px; border: 2px solid var(--elem-color, #555);
                background: transparent; color: var(--elem-color, #ccc);
                font-size: 0.95em; cursor: pointer; transition: all 0.18s;
                min-width: 90px; text-align: center;
            }
            .elem-pick-btn:hover { background: color-mix(in srgb, var(--elem-color, #555) 20%, transparent); }
            .elem-pick-btn.elem-primary {
                background: var(--elem-color, #555); color: #fff; font-weight: bold;
                box-shadow: 0 0 12px var(--elem-color, #555);
            }
            .elem-pick-btn.elem-adjacent {
                border-style: dashed; opacity: 0.85;
            }
            .pick-info {
                font-size: 0.83em; color: #aab0d0; min-height: 1.5em;
                margin: 6px 0 0; text-align: center;
            }
            /* --- Element tab bar (replaces the old dropdown) --- */
            .element-picker {
                display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
            }
            .elem-label { color: #aab0d0; font-size: 0.85em; white-space: nowrap; }
            .elem-tab-btn {
                padding: 5px 14px; border-radius: 20px;
                border: 2px solid var(--elem-color, #555);
                background: transparent; color: var(--elem-color, #ccc);
                font-size: 0.82em; cursor: pointer; transition: all 0.18s;
                white-space: nowrap;
            }
            .elem-tab-btn:hover { background: color-mix(in srgb, var(--elem-color, #555) 20%, transparent); }
            .elem-tab-btn.active {
                background: var(--elem-color, #555); color: #fff; font-weight: bold;
            }
            /* --- Overview element section headers --- */
            .ov-section-header {
                font-size: 0.8em; font-weight: bold; letter-spacing: 0.1em;
                text-transform: uppercase; margin: 10px 0 4px;
                padding-bottom: 3px; border-bottom: 1px solid currentColor;
            }
            /* --- Cross-element dot indicator on nodes --- */
            .node-other-dot {
                fill: #f0b04a; stroke: none;
            }
            /* --- Adjacent cost tint on cost label --- */
            .cost-adjacent { fill: #f0b04a !important; }
        `;
        document.head.appendChild(style);
    }

    // ---------- ELEMENT HELPERS ----------

    /** Returns the two neighbouring elements in the ring for a given element. */
    function getAdjacentElements(elem) {
        const i = ELEMENT_RING.indexOf(elem);
        if (i === -1) return [];
        const len = ELEMENT_RING.length;
        return [ELEMENT_RING[(i - 1 + len) % len], ELEMENT_RING[(i + 1) % len]];
    }

    /**
     * Returns the elements the player may interact with:
     *   - non-elemental trees → ["Neutral"]
     *   - elemental trees with a primary chosen → [primary, adj1, adj2]
     *   - elemental trees before primary is chosen → [] (picker not done yet)
     */
    function getAvailableElements() {
        if (!tree?.hasElements) return ["Neutral"];
        if (!primaryElement) return [];
        return [primaryElement, ...getAdjacentElements(primaryElement)];
    }

    /**
     * Returns the point cost to unlock `node` under `element`.
     *   - Non-elemental tree or primary element → base cost
     *   - Adjacent element → base cost × 2
     *   - Everything else → Infinity (not available)
     */
    function getEffectiveCost(node, element) {
        const base = node.cost ?? 1;
        if (!tree?.hasElements || !primaryElement) return base;
        if (element === primaryElement) return base;
        if (getAdjacentElements(primaryElement).includes(element)) return base * 2;
        return Infinity;
    }

    // ---------- UNLOCKED HELPERS ----------

    function getUnlockedForElement(element) {
        if (!unlocked.has(element)) unlocked.set(element, new Set());
        return unlocked.get(element);
    }

    function isUnlocked(nodeId, element) {
        return unlocked.has(element) && unlocked.get(element).has(nodeId);
    }

    /** True if the node has been unlocked in *any* element (used for the visual cross-element dot). */
    function isUnlockedInAny(nodeId) {
        for (const [, set] of unlocked) {
            if (set.has(nodeId)) return true;
        }
        return false;
    }

    // ---------- UTILITY ----------
    function setMessage(text) {
        msgEl.textContent = text || "";
    }

    function updateHUD() {
        if (!tree) return;
        let txt = `Tree: ${tree.name} • Points left: ${pointsLeft}`;
        if (tree.hasElements && primaryElement) {
            const adj = getAdjacentElements(primaryElement);
            txt += ` • Primary: ${primaryElement} | Available: ${adj.join(", ")} (2×)`;
        }
        pointsInfo.textContent = txt;
    }

    function downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function cacheBaseLabels() {
        if (!tree?.nodes) return;
        baseNodeLabels.clear();
        for (const node of tree.nodes) {
            const neutralTitle = node.baseLabel || node.elements?.Neutral?.title || node.label;
            baseNodeLabels.set(node.id, neutralTitle);
            node.baseLabel = neutralTitle;
        }
    }

    function applyElementToTree() {
        if (!tree?.nodes) return;
        if (baseNodeLabels.size === 0) cacheBaseLabels();
        for (const node of tree.nodes) {
            const elemData = node.elements?.[selectedElement] || node.elements?.Neutral || {};
            const base     = baseNodeLabels.get(node.id) || node.baseLabel || node.label;
            node.label       = elemData.title       || base;
            node.description = elemData.description || "";
            node.effect      = elemData.effect      || "";
        }
    }

    function refreshOverview() {
        if (!tree) return;
        const sections = [];

        if (tree.hasElements && primaryElement) {
            // Group by element for elemental trees
            let anyUnlocked = false;
            for (const elem of getAvailableElements()) {
                const set   = unlocked.get(elem);
                if (!set || set.size === 0) continue;
                anyUnlocked = true;
                const color = ELEMENT_COLORS[elem] || "#8899cc";
                const badge = elem === primaryElement ? " ★" : " (2×)";
                const items = tree.nodes
                    .filter(n => set.has(n.id))
                    .map(n => {
                        const ed = n.elements?.[elem] || n.elements?.Neutral || {};
                        return `
                        <div class="overview-item">
                          <div class="ov-title" style="color:${color}">${ed.title || n.baseLabel || n.label}</div>
                          <div class="ov-effect">${ed.effect || "—"}</div>
                        </div>`;
                    }).join("");
                sections.push(`<div class="ov-section-header" style="color:${color}">${elem}${badge}</div>${items}`);
            }
            if (!anyUnlocked) sections.push('<p class="no-unlocks">No nodes unlocked yet.</p>');
        } else {
            // Flat list for non-elemental trees
            const unlockedNodes = tree.nodes.filter(n => isUnlocked(n.id, "Neutral"));
            sections.push(
                unlockedNodes.length === 0
                    ? '<p class="no-unlocks">No nodes unlocked yet.</p>'
                    : unlockedNodes.map(n => `
                        <div class="overview-item">
                          <div class="ov-title">${n.label}</div>
                          <div class="ov-effect">${n.effect}</div>
                        </div>`).join("")
            );
        }

        overviewList.innerHTML = sections.join("");
    }

    // ---------- NODE STATE ----------
    function canUnlock(node) {
        if (isUnlocked(node.id, selectedElement)) return false;
        const cost = getEffectiveCost(node, selectedElement);
        if (cost === Infinity || pointsLeft < cost) return false;
        const requires = node.requires || [];
        if (requires.length === 0) return true;
        return requires.some(reqId => isUnlocked(reqId, selectedElement));
    }

    function nodeState(node) {
        if (isUnlocked(node.id, selectedElement)) return "unlocked";
        if (getEffectiveCost(node, selectedElement) === Infinity) return "locked";
        return canUnlock(node) ? "available" : "locked";
    }

    // ---------- ELEMENT PICKER MODAL (shown on tree load) ----------
    function showElementPickerModal(onPick) {
        const existing = document.querySelector(".modal-overlay");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";

        let chosenPrimary = null;

        overlay.innerHTML = `
          <div class="modal-content elem-picker-modal">
            <h2>Choose Your Element</h2>
            <p class="pick-subtitle">
              Select your primary element. Its two neighbours in the ring will also be
              available at <strong>2× cost</strong>. All other elements are locked.
            </p>
            <div class="element-grid"></div>
            <p class="pick-info"></p>
            <div class="modal-actions">
              <button class="btn confirm-elem-btn" disabled>Confirm</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);

        const grid       = overlay.querySelector(".element-grid");
        const pickInfo   = overlay.querySelector(".pick-info");
        const confirmBtn = overlay.querySelector(".confirm-elem-btn");

        function renderButtons() {
            const adj = chosenPrimary ? getAdjacentElements(chosenPrimary) : [];
            grid.innerHTML = ELEMENT_RING.map(el => {
                const color  = ELEMENT_COLORS[el] || "#8899cc";
                let cls = "elem-pick-btn";
                let badge = "";
                if (el === chosenPrimary)   { cls += " elem-primary";  badge = " ★"; }
                else if (adj.includes(el))  { cls += " elem-adjacent"; badge = " (2×)"; }
                return `<button class="${cls}" data-elem="${el}"
                                style="--elem-color:${color}">${el}${badge}</button>`;
            }).join("");

            grid.querySelectorAll(".elem-pick-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    chosenPrimary = btn.dataset.elem;
                    const a = getAdjacentElements(chosenPrimary);
                    pickInfo.textContent =
                        `Primary: ${chosenPrimary} (1× cost)  |  Adjacent: ${a.join(", ")} (2× cost)  |  Others: locked`;
                    confirmBtn.disabled = false;
                    renderButtons();
                });
            });
        }

        renderButtons();

        confirmBtn.addEventListener("click", () => {
            if (!chosenPrimary) return;
            overlay.remove();
            onPick(chosenPrimary);
        });
    }

    // ---------- NODE MODAL ----------
    function showNodeModal(node) {
        const existing = document.querySelector(".modal-overlay");
        if (existing) existing.remove();

        const byId      = Object.fromEntries(tree.nodes.map(n => [n.id, n]));
        const reqs      = node.requires || [];
        const reqLabels = reqs.map(r => byId[r]?.label ?? r).join(", ") || "None";
        const reqText   = reqs.length > 1 ? "Requires one of:" : "Requires:";

        const state         = nodeState(node);
        const available     = state === "available";
        const effectiveCost = getEffectiveCost(node, selectedElement);
        const unavailable   = effectiveCost === Infinity;
        const isAdjElem     = tree?.hasElements && primaryElement &&
                              selectedElement !== primaryElement &&
                              getAdjacentElements(primaryElement).includes(selectedElement);
        const costNote      = isAdjElem
            ? ` <span style="color:#f0b04a">(2× — adjacent element)</span>`
            : "";
        const elemColor     = ELEMENT_COLORS[selectedElement] || "#8899cc";

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
          <div class="modal-content">
            <h2>${node.label}</h2>
            ${tree?.hasElements && primaryElement
                ? `<p style="color:${elemColor}"><strong>Element:</strong> ${selectedElement}
                   ${selectedElement === primaryElement ? "★ Primary" : "(adjacent)"}</p>`
                : ""}
            <p><strong>Description:</strong> ${node.description || "—"}</p>
            <p class="effect"><strong>Effect:</strong> ${node.effect || "—"}</p>
            <p class="cost"><strong>Cost:</strong> ${
                unavailable
                    ? "Not available (non-adjacent element)"
                    : `${effectiveCost} point${effectiveCost !== 1 ? "s" : ""}${costNote}`
            }</p>
            <p><strong>${reqText}</strong> ${reqLabels}</p>
            <p><strong>Status:</strong> ${state.charAt(0).toUpperCase() + state.slice(1)}</p>
            <div class="modal-actions">
              ${available && !unavailable ? '<button class="btn unlock-btn">Unlock</button>' : ""}
              <button class="btn close-btn">Close</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);

        const closeModal = () => overlay.remove();
        overlay.querySelector(".close-btn").addEventListener("click", closeModal);
        overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

        if (available && !unavailable) {
            overlay.querySelector(".unlock-btn").addEventListener("click", () => {
                if (!canUnlock(node)) {
                    setMessage("Cannot unlock (prerequisites or points changed).");
                    closeModal();
                    return;
                }
                const cost = getEffectiveCost(node, selectedElement);
                getUnlockedForElement(selectedElement).add(node.id);
                pointsLeft -= cost;
                setMessage(`Unlocked "${node.label}" [${selectedElement}].`);
                updateHUD();
                drawTree();
                if (overviewPanel && !overviewPanel.classList.contains("hidden")) refreshOverview();
                closeModal();
            });
        }

        const escHandler = e => {
            if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
        };
        document.addEventListener("keydown", escHandler);
    }

    // ---------- CONFIRMATION MODAL ----------
    function showConfirmModal(message, onConfirm) {
        const existing = document.querySelector(".modal-overlay");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
          <div class="modal-content">
            <h2>Confirm</h2>
            <p>${message}</p>
            <div class="modal-actions">
              <button class="btn confirm-btn">Confirm</button>
              <button class="btn cancel-btn">Cancel</button>
            </div>
          </div>`;

        document.body.appendChild(overlay);

        const closeModal = () => overlay.remove();
        overlay.querySelector(".cancel-btn").addEventListener("click", closeModal);
        overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
        overlay.querySelector(".confirm-btn").addEventListener("click", () => {
            closeModal();
            onConfirm();
        });

        const escHandler = e => {
            if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
        };
        document.addEventListener("keydown", escHandler);
    }

    // ---------- AUTO-LAYOUT ----------
    function autoLayout(nodes, CX, CY) {
        const LAYER_GAP  = 200;
        const MIN_SPREAD = 160;

        const layer = new Map();
        const queue = [];

        for (const n of nodes) {
            if (!n.requires || n.requires.length === 0) {
                layer.set(n.id, 0);
                queue.push(n);
            }
        }

        const ids = new Set(nodes.map(n => n.id));
        for (const n of nodes) {
            if (!layer.has(n.id) && n.requires.every(r => !ids.has(r))) {
                layer.set(n.id, 0);
                queue.push(n);
            }
        }

        while (queue.length) {
            const cur      = queue.shift();
            const curLayer = layer.get(cur.id);
            for (const candidate of nodes) {
                if (!layer.has(candidate.id) && candidate.requires.includes(cur.id)) {
                    layer.set(candidate.id, curLayer + 1);
                    queue.push(candidate);
                }
            }
        }

        for (const n of nodes) {
            if (!layer.has(n.id)) layer.set(n.id, 0);
        }

        const byLayer = new Map();
        for (const n of nodes) {
            const l = layer.get(n.id);
            if (!byLayer.has(l)) byLayer.set(l, []);
            byLayer.get(l).push(n);
        }

        const totalLayers = byLayer.size;

        for (const [l, layerNodes] of byLayer) {
            const count  = layerNodes.length;
            const spread = Math.max(MIN_SPREAD, MIN_SPREAD * count);
            const startX = CX - (spread * (count - 1)) / 2;
            const y      = CY + (l - (totalLayers - 1) / 2) * LAYER_GAP;
            layerNodes.forEach((n, i) => {
                n.x = count === 1 ? CX : startX + i * spread;
                n.y = y;
            });
        }
    }

    // ---------- TREE VALIDATION ----------
    function validateTree(treeData) {
        if (!treeData || typeof treeData !== "object")
            throw new Error("Invalid tree: root must be a JSON object.");
        if (!treeData.name || typeof treeData.name !== "string")
            throw new Error("Invalid tree: missing or invalid 'name'.");
        if (typeof treeData.points !== "number" || treeData.points < 0)
            throw new Error("Invalid tree: 'points' must be a non-negative number.");
        if (!Array.isArray(treeData.nodes) || treeData.nodes.length === 0)
            throw new Error("Invalid tree: 'nodes' must be a non-empty array.");

        const ids = new Set();
        for (const node of treeData.nodes) {
            if (!node.id || typeof node.id !== "string")
                throw new Error(`Node is missing a valid string 'id': ${JSON.stringify(node)}`);
            if (ids.has(node.id))
                throw new Error(`Duplicate node id: "${node.id}".`);
            ids.add(node.id);

            if (!node.label)  node.label    = node.id;
            node.cost         = node.cost    ?? 1;
            node.requires     = Array.isArray(node.requires) ? node.requires : [];
            node.elements     = node.elements || {};
            node.x            = typeof node.x === "number" ? node.x : 0;
            node.y            = typeof node.y === "number" ? node.y : 0;
        }

        for (const node of treeData.nodes) {
            for (const reqId of node.requires) {
                if (!ids.has(reqId))
                    throw new Error(`Node "${node.id}" requires unknown id "${reqId}".`);
            }
        }

        const container = document.getElementById("skillTreeContainer");
        const w  = container?.offsetWidth  || window.innerWidth  || 1200;
        const h  = container?.offsetHeight || (window.innerHeight - 56) || 800;
        const CX = w / 2;
        const CY = h / 2;

        const hasLayout = treeData.nodes.some(n => n.x !== 0 || n.y !== 0);
        if (hasLayout) {
            for (const node of treeData.nodes) {
                node.x += CX;
                node.y += CY;
            }
        } else {
            autoLayout(treeData.nodes, CX, CY);
        }

        return treeData;
    }

    // ---------- DRAWING ----------
    function clearSvg() {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
    }

    function zoomIn() {
        const cur = svg.getAttribute("data-scale") || "1";
        const next = Math.max(0.2, parseFloat(cur) + parseFloat(cur) * 0.1).toFixed(2);
        svg.style.transform = `scale(${next})`;
        svg.setAttribute("data-scale", next);
    }

    function zoomOut() {
        const cur = svg.getAttribute("data-scale") || "1";
        const next = Math.max(0.2, parseFloat(cur) - parseFloat(cur) * 0.1).toFixed(2);
        svg.style.transform = `scale(${next})`;
        svg.setAttribute("data-scale", next);
    }

    function drawTree() {
        const container = document.getElementById("skillTreeContainer");
        if (container) {
            if (svg.parentElement !== container) container.appendChild(svg);
            const w = container.offsetWidth  || window.innerWidth  || 1200;
            const h = container.offsetHeight || (window.innerHeight - 56) || 800;
            svg.setAttribute("width",  w);
            svg.setAttribute("height", h);
            svg.style.width  = w + "px";
            svg.style.height = h + "px";
        }

        clearSvg();
        if (!tree) return;

        const byId       = Object.fromEntries(tree.nodes.map(n => [n.id, n]));
        const elemColor  = ELEMENT_COLORS[selectedElement] || "#8899cc";

        // ── Edges ──
        for (const node of tree.nodes) {
            for (const reqId of (node.requires || [])) {
                const from = byId[reqId];
                if (!from) continue;
                const line = document.createElementNS(SVG_NS, "line");
                line.setAttribute("x1", from.x);
                line.setAttribute("y1", from.y);
                line.setAttribute("x2", node.x);
                line.setAttribute("y2", node.y);
                line.setAttribute("class", "link");
                if (isUnlocked(reqId, selectedElement) && isUnlocked(node.id, selectedElement)) {
                    line.setAttribute("stroke", "#37cf84");
                }
                svg.appendChild(line);
            }
        }

        // ── Nodes ──
        for (const node of tree.nodes) {
            const state         = nodeState(node);
            const effectiveCost = getEffectiveCost(node, selectedElement);
            const isAdj         = tree?.hasElements && primaryElement &&
                                  selectedElement !== primaryElement &&
                                  getAdjacentElements(primaryElement).includes(selectedElement);

            const g = document.createElementNS(SVG_NS, "g");
            g.setAttribute("class", `node ${state}`);
            g.setAttribute("transform", `translate(${node.x},${node.y})`);

            const circle = document.createElementNS(SVG_NS, "circle");
            circle.setAttribute("r", "38");

            // Tint the circle stroke with the active element colour when unlocked
            if (state === "unlocked" && tree?.hasElements && primaryElement) {
                circle.setAttribute("stroke", elemColor);
                circle.setAttribute("stroke-width", "3");
            }

            const titleText = document.createElementNS(SVG_NS, "text");
            titleText.setAttribute("y", "-4");
            titleText.textContent = node.label;

            const costText = document.createElementNS(SVG_NS, "text");
            costText.setAttribute("y", "16");
            costText.setAttribute("font-size", "12");

            if (effectiveCost === Infinity) {
                costText.setAttribute("fill", "#555");
                costText.textContent = "Locked";
            } else if (isAdj) {
                // Adjacent element — highlight the 2× cost in amber
                costText.setAttribute("fill", "#f0b04a");
                costText.textContent = `Cost: ${effectiveCost} (2×)`;
            } else {
                costText.setAttribute("fill", "#c5d0f5");
                costText.textContent = `Cost: ${effectiveCost}`;
            }

            g.append(circle, titleText, costText);

            // Small amber dot if this node is unlocked in at least one OTHER element
            if (!isUnlocked(node.id, selectedElement) && isUnlockedInAny(node.id)) {
                const dot = document.createElementNS(SVG_NS, "circle");
                dot.setAttribute("cx", "28");
                dot.setAttribute("cy", "-28");
                dot.setAttribute("r", "6");
                dot.setAttribute("class", "node-other-dot");
                dot.setAttribute("title", "Unlocked in another element");
                g.appendChild(dot);
            }

            g.addEventListener("mouseenter", () =>
                setMessage(`${node.label} — ${node.description || "No description"}`)
            );
            g.addEventListener("mouseleave", () => setMessage(""));
            g.addEventListener("click", e => { e.stopPropagation(); showNodeModal(node); });

            svg.appendChild(g);
        }

        if (overviewPanel && !overviewPanel.classList.contains("hidden")) {
            refreshOverview();
        }
    }

    // ---------- TREE I/O ----------
    function loadTree(data) {
        console.log("Loading tree data:", data);
        tree           = validateTree(structuredClone(data));
        unlocked       = new Map();
        pointsLeft     = tree.points;
        primaryElement = null;
        selectedElement = "Neutral";
        cacheBaseLabels();
        applyElementToTree();
        setMessage(`Loaded "${tree.name}".`);
        updateHUD();
        updateElementSelectorUI();

        if (tree.hasElements) {
            // Draw once with Neutral as placeholder, then open the element picker
            drawTree();
            showElementPickerModal(chosenElement => {
                primaryElement  = chosenElement;
                selectedElement = chosenElement;
                applyElementToTree();
                updateHUD();
                updateElementSelectorUI();
                drawTree();
                const adj = getAdjacentElements(primaryElement);
                setMessage(
                    `Primary: ${primaryElement} (1×) | Available: ${adj.join(", ")} (2×) | Others locked.`
                );
            });
        } else {
            drawTree();
        }
    }

    function saveTree() {
        if (!tree) return;
        const container = document.getElementById("skillTreeContainer");
        const w  = container?.offsetWidth  || window.innerWidth  || 1200;
        const h  = container?.offsetHeight || window.innerHeight - 56 || 800;
        const CX = w / 2;
        const CY = h / 2;
        const exportTree = {
            name: tree.name,
            points: tree.points,
            hasElements: tree.hasElements,
            nodes: tree.nodes.map(n => ({
                id:       n.id,
                label:    n.baseLabel || n.label,
                x:        Math.round(n.x - CX),
                y:        Math.round(n.y - CY),
                cost:     n.cost,
                requires: [...(n.requires || [])],
                elements: n.elements || {}
            }))
        };
        downloadJSON(exportTree, `${tree.name}.json`);
    }

    // ---------- PROGRESS I/O ----------
    function saveProgress() {
        if (!tree) return;
        const unlockedByElement = {};
        for (const [elem, set] of unlocked) {
            if (set.size > 0) unlockedByElement[elem] = Array.from(set);
        }
        const progress = {
            treeName: tree.name,
            primaryElement,
            selectedElement,
            unlockedByElement,
            pointsLeft
        };
        downloadJSON(progress, `${tree.name}-progress.json`);
    }

    function loadProgress(file) {
        file.text().then(text => {
            const data = JSON.parse(text);
            if (data.treeName !== tree.name) {
                setMessage(`Progress is for "${data.treeName}", but current tree is "${tree.name}".`);
                return;
            }

            unlocked = new Map();

            if (data.unlockedByElement) {
                // New multi-element format
                for (const [elem, ids] of Object.entries(data.unlockedByElement)) {
                    unlocked.set(elem, new Set(ids));
                }
            } else if (Array.isArray(data.unlocked)) {
                // Backward-compat: old single-element flat array
                const legacyElem = data.element || "Neutral";
                unlocked.set(legacyElem, new Set(data.unlocked));
            }

            pointsLeft = data.pointsLeft ?? tree.points;

            if (data.primaryElement && ELEMENT_RING.includes(data.primaryElement)) {
                primaryElement = data.primaryElement;
            }

            const savedSel = data.selectedElement;
            if (savedSel && ELEMENTS.includes(savedSel) && getAvailableElements().includes(savedSel)) {
                selectedElement = savedSel;
            } else {
                selectedElement = primaryElement || "Neutral";
            }

            applyElementToTree();
            updateHUD();
            updateElementSelectorUI();
            setMessage(`Loaded progress for "${tree.name}".`);
            drawTree();
        }).catch(err => setMessage(`Load failed: ${err.message}`));
    }

    // ---------- RESET ----------
    function resetProgress() {
        if (!tree) return;
        showConfirmModal("Are you sure you want to reset all progress? This cannot be undone.", () => {
            unlocked        = new Map();
            pointsLeft      = tree.points;
            primaryElement  = null;
            selectedElement = "Neutral";
            applyElementToTree();
            updateHUD();
            updateElementSelectorUI();

            if (tree.hasElements) {
                drawTree();
                showElementPickerModal(chosenElement => {
                    primaryElement  = chosenElement;
                    selectedElement = chosenElement;
                    applyElementToTree();
                    updateHUD();
                    updateElementSelectorUI();
                    drawTree();
                    setMessage(`Reset. Primary: ${primaryElement}.`);
                });
            } else {
                drawTree();
                setMessage("Progress reset.");
            }
        });
    }

    // ---------- ELEMENT SELECTOR UI (tab bar) ----------
    function createElementPicker() {
        if (document.getElementById("elementPickerContainer")) return;
        const container = document.createElement("div");
        container.className = "element-picker";
        container.id = "elementPickerContainer";
        document.body.appendChild(container);
        updateElementSelectorUI();
    }

    /**
     * Rebuilds the element tab bar.
     *   - Hidden for non-elemental trees.
     *   - Shows [Primary ★] [Adj1 2×] [Adj2 2×] once a primary is chosen.
     *   - Empty (hidden) before the primary is chosen.
     */
    function updateElementSelectorUI() {
        const container = document.getElementById("elementPickerContainer");
        if (!container) return;

        if (!tree?.hasElements) {
            container.style.display = "none";
            return;
        }

        container.style.display = "";

        if (!primaryElement) {
            container.innerHTML = "";
            return;
        }

        const available = getAvailableElements();
        container.innerHTML =
            `<span class="elem-label">Element:</span>` +
            available.map(el => {
                const color   = ELEMENT_COLORS[el] || "#8899cc";
                const badge   = el === primaryElement ? " ★" : " (2×)";
                const active  = el === selectedElement ? " active" : "";
                return `<button class="elem-tab-btn${active}" data-elem="${el}"
                                style="--elem-color:${color}">${el}${badge}</button>`;
            }).join("");

        container.querySelectorAll(".elem-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                selectedElement = btn.dataset.elem;
                applyElementToTree();
                updateElementSelectorUI();
                drawTree();
                const adj = selectedElement !== primaryElement;
                setMessage(
                    `Viewing ${selectedElement}${adj ? " (2× cost — adjacent element)" : " (primary element)"}.`
                );
            });
        });
    }

    // ---------- DEFAULT TREE ----------
    const defaultTree = {
        name: "Starter Tree",
        points: 6,
        hasElements: false,
        nodes: [
            { id: "root", label: "Drück ma Load tree (bitti)", cost: 161, requires: [], elements: {} }
        ]
    };

    // ---------- EVENT LISTENERS ----------
    fileInput.addEventListener("change", async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            loadTree(data);
        } catch (err) {
            setMessage(`Load failed: ${err.message}`);
        } finally {
            fileInput.value = "";
        }
    });

    progressInput.addEventListener("change", e => {
        const file = e.target.files?.[0];
        if (!file) return;
        loadProgress(file);
        progressInput.value = "";
    });

    saveTreeBtn.addEventListener("click",     saveTree);
    saveProgressBtn.addEventListener("click", saveProgress);
    resetBtn.addEventListener("click",        resetProgress);
    zoomInBtn.addEventListener("click",       zoomIn);
    zoomOutBtn.addEventListener("click",      zoomOut);

    toggleOverviewBtn.addEventListener("click", () => {
        overviewPanel.classList.toggle("hidden");
        if (!overviewPanel.classList.contains("hidden")) refreshOverview();
    });

    addPointBtn.addEventListener("click", () => {
        if (!tree) return;
        tree.points += 1;
        pointsLeft  += 1;
        updateHUD();
        drawTree();
    });

    subPointBtn.addEventListener("click", () => {
        if (!tree) return;
        const spent = tree.points - pointsLeft;
        if (tree.points > spent) {
            tree.points -= 1;
            pointsLeft   = Math.max(0, pointsLeft - 1);
            updateHUD();
            drawTree();
        } else {
            setMessage("Cannot remove points: all points are spent.");
        }
    });

    // ---------- START ----------
    injectStyles();
    createElementPicker();
    requestAnimationFrame(() => loadTree(defaultTree));

})();