(function(){
    "use strict";

    // ---------- CONSTANTS & GLOBALS ----------
    const ELEMENTS = ["Neutral", "Fire", "Ice", "Lightning", "Nature", "Weird", "Physical", "Wind"];
    const SVG_NS = "http://www.w3.org/2000/svg";

    // DOM elements
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.id = "treeSvg";
    svg.style.display = "block";
    svg.style.transformOrigin = "center center";

    const fileInput = document.getElementById("fileInput");
    const saveTreeBtn = document.getElementById("saveTreeBtn");
    const progressInput = document.getElementById("progressInput");
    const saveProgressBtn = document.getElementById("saveProgressBtn");
    const resetBtn = document.getElementById("resetBtn");
    const pointsInfo = document.getElementById("pointsInfo");
    const msgEl = document.getElementById("msg");
    const toggleOverviewBtn = document.getElementById("toggleOverviewBtn");
    const zoomInBtn = document.getElementById("zoomInBtn");
    const zoomOutBtn = document.getElementById("zoomOutBtn");
    const addPointBtn = document.getElementById("addPointBtn");
    const subPointBtn = document.getElementById("subPointBtn");
    const overviewPanel = document.getElementById("overviewPanel");
    const overviewList = document.getElementById("overviewList");
    
    // State
    let tree = null;
    let unlocked = new Set();
    let pointsLeft = 0;
    let selectedElement = localStorage.getItem("selectedElement") || "Neutral";

    const baseNodeLabels = new Map();

    // ---------- UTILITY ----------
    function setMessage(text) {
      msgEl.textContent = text || "";
    }

    function updateHUD() {
      if (!tree) return;
      pointsInfo.textContent = `Tree: ${tree.name} • Points left: ${pointsLeft}`;
    }

    function downloadJSON(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
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
        const base = baseNodeLabels.get(node.id) || node.baseLabel || node.label;
        node.label = elemData.title || base;
        node.description = elemData.description || "";
        node.effect = elemData.effect || "";
      }
    }

    function refreshOverview() {
      if (!tree) return;
      const unlockedNodes = tree.nodes.filter(n => unlocked.has(n.id));
      overviewList.innerHTML = unlockedNodes.length === 0
          ? '<p class="no-unlocks">No nodes unlocked yet.</p>'
          : unlockedNodes.map(n => `
              <div class="overview-item">
                <div class="ov-title">${n.label}</div>
                <div class="ov-effect">${n.effect}</div>
              </div>
          `).join('');
    }

    // ---------- NODE STATE ----------
    function canUnlock(node) {
      if (unlocked.has(node.id)) return false;
      if (pointsLeft < (node.cost ?? 1)) return false;
      const requires = node.requires || [];
      if (requires.length === 0) return true;
      return requires.some(reqId => unlocked.has(reqId));
    }

    function nodeState(node) {
      if (unlocked.has(node.id)) return "unlocked";
      return canUnlock(node) ? "available" : "locked";
    }

    // ---------- MODAL ----------
    function showNodeModal(node) {
      const existing = document.querySelector('.modal-overlay');
      if (existing) existing.remove();

      const byId = Object.fromEntries(tree.nodes.map(n => [n.id, n]));
      const reqs = node.requires || [];
      const reqLabels = reqs.map(reqId => {
        const reqNode = byId[reqId];
        return reqNode ? reqNode.label : reqId;
      }).join(', ') || 'None';
      const reqText = reqs.length > 1 ? 'Requires one of:' : 'Requires:';

      const state = nodeState(node);
      const available = (state === 'available');

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-content">
          <h2>${node.label}</h2>
          <p><strong>Description:</strong> ${node.description || '—'}</p>
          <p class="effect"><strong>Effect:</strong> ${node.effect || '—'}</p>
          <p class="cost"><strong>Cost:</strong> ${node.cost ?? 1} point${node.cost !== 1 ? 's' : ''}</p>
          <p><strong>${reqText}</strong> ${reqLabels}</p>
          <p><strong>Status:</strong> ${state.charAt(0).toUpperCase() + state.slice(1)}</p>
          <div class="modal-actions">
            ${available ? '<button class="btn unlock-btn">Unlock</button>' : ''}
            <button class="btn close-btn">Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const closeModal = () => overlay.remove();

      overlay.querySelector('.close-btn').addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      if (available) {
        overlay.querySelector('.unlock-btn').addEventListener('click', () => {
          const cost = node.cost ?? 1;
          if (!canUnlock(node)) {
            setMessage("Cannot unlock (prerequisites or points changed).");
            closeModal();
            return;
          }
          unlocked.add(node.id);
          pointsLeft -= cost;
          setMessage(`Unlocked "${node.label}".`);
          updateHUD();
          drawTree();
          closeModal();
        });
      }

      const escHandler = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);
    }

    // ---------- CONFIRMATION MODAL ----------
    function showConfirmModal(message, onConfirm) {
      const existing = document.querySelector('.modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-content">
          <h2>Confirm</h2>
          <p>${message}</p>
          <div class="modal-actions">
            <button class="btn confirm-btn">Confirm</button>
            <button class="btn cancel-btn">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const closeModal = () => overlay.remove();

      overlay.querySelector('.cancel-btn').addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      overlay.querySelector('.confirm-btn').addEventListener('click', () => {
        closeModal();
        onConfirm();
      });

      const escHandler = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } };
      document.addEventListener('keydown', escHandler);
    }

    function autoLayout(nodes, CX, CY) {
      const LAYER_GAP  = 200;  // vertical distance between layers
      const MIN_SPREAD = 160;  // minimum horizontal spacing between nodes

      // --- 1. Assign each node its depth layer via BFS ---
      const layer = new Map();
      const queue = [];

      // Seed: nodes with no requirements are roots (layer 0)
      for (const n of nodes) {
        if (!n.requires || n.requires.length === 0) {
          layer.set(n.id, 0);
          queue.push(n);
        }
      }

      // Nodes whose all predecessors are unknown get layer 0 too
      const ids = new Set(nodes.map(n => n.id));
      for (const n of nodes) {
        if (!layer.has(n.id) && n.requires.every(r => !ids.has(r))) {
          layer.set(n.id, 0);
          queue.push(n);
        }
      }

      while (queue.length) {
        const cur = queue.shift();
        const curLayer = layer.get(cur.id);
        for (const candidate of nodes) {
          if (!layer.has(candidate.id) && candidate.requires.includes(cur.id)) {
            layer.set(candidate.id, curLayer + 1);
            queue.push(candidate);
          }
        }
      }

      // Fallback: any node still unassigned goes to layer 0
      for (const n of nodes) {
        if (!layer.has(n.id)) layer.set(n.id, 0);
      }

      // --- 2. Group nodes by layer ---
      const byLayer = new Map();
      for (const n of nodes) {
        const l = layer.get(n.id);
        if (!byLayer.has(l)) byLayer.set(l, []);
        byLayer.get(l).push(n);
      }

      const totalLayers = byLayer.size;

      // --- 3. Assign pixel positions ---
      for (const [l, layerNodes] of byLayer) {
        const count   = layerNodes.length;
        const spread  = Math.max(MIN_SPREAD, MIN_SPREAD * count);
        const startX  = CX - (spread * (count - 1)) / 2;
        const y       = CY + (l - (totalLayers - 1) / 2) * LAYER_GAP;

        layerNodes.forEach((n, i) => {
          n.x = count === 1 ? CX : startX + i * spread;
          n.y = y;
        });
      }
    }

    function validateTree(treeData) {

      // ── 1. Top-level sanity checks ────────────────────────────────────────
      if (!treeData || typeof treeData !== "object")
        throw new Error("Invalid tree: root must be a JSON object.");
      if (!treeData.name || typeof treeData.name !== "string")
        throw new Error("Invalid tree: missing or invalid 'name'.");
      if (typeof treeData.points !== "number" || treeData.points < 0)
        throw new Error("Invalid tree: 'points' must be a non-negative number.");
      if (!Array.isArray(treeData.nodes) || treeData.nodes.length === 0)
        throw new Error("Invalid tree: 'nodes' must be a non-empty array.");

      // ── 2. Per-node validation and normalisation ──────────────────────────
      const ids = new Set();
      for (const node of treeData.nodes) {
        if (!node.id || typeof node.id !== "string")
          throw new Error(`Node is missing a valid string 'id': ${JSON.stringify(node)}`);
        if (ids.has(node.id))
          throw new Error(`Duplicate node id: "${node.id}".`);
        ids.add(node.id);

        // Normalise optional fields
        if (!node.label)      node.label    = node.id;
        node.cost             = node.cost    ?? 1;
        node.requires         = Array.isArray(node.requires) ? node.requires : [];
        node.elements         = node.elements || {};
        node.x                = typeof node.x === "number" ? node.x : 0;
        node.y                = typeof node.y === "number" ? node.y : 0;
      }

      // ── 3. Validate requires references ──────────────────────────────────
      for (const node of treeData.nodes) {
        for (const reqId of node.requires) {
          if (!ids.has(reqId))
            throw new Error(`Node "${node.id}" requires unknown id "${reqId}".`);
        }
      }

      // ── 4. Determine SVG canvas centre ────────────────────────────────────
      const container = document.getElementById("skillTreeContainer");
      const w  = container?.offsetWidth  || window.innerWidth  || 1200;
      const h  = container?.offsetHeight || (window.innerHeight - 56) || 800;
      const CX = w / 2;
      const CY = h / 2;

      // ── 5. Coordinate conversion ──────────────────────────────────────────
      // If every node is at (0, 0) the JSON carries no layout information
      // (either never set, or all nodes genuinely at centre – pathological).
      // In that case compute positions automatically.
      const hasLayout = treeData.nodes.some(n => n.x !== 0 || n.y !== 0);

      if (hasLayout) {
        // JSON uses centre-relative offsets (see saveTree) → convert to absolute
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
      const currentScale = svg.getAttribute("data-scale") || "1";
      const newScale = Math.max(0.2, parseFloat(currentScale) + parseFloat(currentScale)*0.1).toFixed(2);
      svg.style.transform = `scale(${newScale})`;
      svg.setAttribute("data-scale", newScale);
    }

    function zoomOut() {
      const currentScale = svg.getAttribute("data-scale") || "1";
      const newScale = Math.max(0.2, parseFloat(currentScale) - parseFloat(currentScale)*0.1).toFixed(2);
      svg.style.transform = `scale(${newScale})`;
      svg.setAttribute("data-scale", newScale);
    }
    
    function drawTree() {
      const container = document.getElementById('skillTreeContainer');
      if (container) {
        if (svg.parentElement !== container) container.appendChild(svg);
        const w = container.offsetWidth || window.innerWidth || 1200;
        const h = container.offsetHeight || (window.innerHeight - 56) || 800;
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.style.width = w + 'px';
        svg.style.height = h + 'px';
      }

      clearSvg();
      if (!tree) return;

      const byId = Object.fromEntries(tree.nodes.map(n => [n.id, n]));

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
          if (unlocked.has(reqId) && unlocked.has(node.id)) {
            line.setAttribute("stroke", "#37cf84");
          }
          svg.appendChild(line);
        }
      }

      for (const node of tree.nodes) {
        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("class", `node ${nodeState(node)}`);
        g.setAttribute("transform", `translate(${node.x},${node.y})`);

        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("r", "38");

        const titleText = document.createElementNS(SVG_NS, "text");
        titleText.setAttribute("y", "-4");
        titleText.textContent = node.label;

        const costText = document.createElementNS(SVG_NS, "text");
        costText.setAttribute("y", "16");
        costText.setAttribute("fill", "#c5d0f5");
        costText.setAttribute("font-size", "12");
        costText.textContent = `Cost: ${node.cost ?? 1}`;

        g.append(circle, titleText, costText);

        g.addEventListener("mouseenter", () => setMessage(`${node.label} — ${node.description || 'No description'}`));
        g.addEventListener("mouseleave", () => setMessage(""));

        g.addEventListener("click", (e) => {
          e.stopPropagation();
          showNodeModal(node);
        });

        svg.appendChild(g);
      }

      if (overviewPanel && !overviewPanel.classList.contains("hidden")) {
          refreshOverview();
      }
    }

    // ---------- TREE I/O ----------
    function loadTree(data) {
      console.log("Loading tree data:", data);
      tree = validateTree(structuredClone(data));
      unlocked.clear();
      pointsLeft = tree.points;
      cacheBaseLabels();
      applyElementToTree();
      setMessage(`Loaded "${tree.name}".`);
      updateHUD();
      selectedElement = "Neutral";
      updateElementPickerVisibility();
      drawTree();
    }

    function saveTree() {
      if (!tree) return;
      const container = document.getElementById('skillTreeContainer');
      const w = container?.offsetWidth  || window.innerWidth  || 1200;
      const h = container?.offsetHeight || window.innerHeight - 56 || 800;
      const CX = w / 2, CY = h / 2;
      const exportTree = {
        name: tree.name,
        points: tree.points,
        nodes: tree.nodes.map(n => ({
          id: n.id,
          label: n.baseLabel || n.label,
          x: Math.round(n.x - CX),
          y: Math.round(n.y - CY),
          cost: n.cost,
          requires: [...(n.requires || [])],
          elements: n.elements || {}
        }))
      };
      downloadJSON(exportTree, `${tree.name}.json`);
    }

    // ---------- PROGRESS I/O ----------
    function saveProgress() {
      if (!tree) return;
      const progress = {
        treeName: tree.name,
        unlocked: Array.from(unlocked),
        pointsLeft,
        element: selectedElement
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
        unlocked = new Set(data.unlocked || []);
        pointsLeft = data.pointsLeft ?? tree.points;
        if (data.element && ELEMENTS.includes(data.element)) {
          selectedElement = data.element;
          localStorage.setItem("selectedElement", selectedElement);
          const sel = document.getElementById("elementSelect");
          if (sel) sel.value = selectedElement;
        }
        applyElementToTree();
        setMessage(`Loaded progress for "${tree.name}".`);
        updateHUD();
        drawTree();
      }).catch(err => setMessage(`Load failed: ${err.message}`));
    }

    // ---------- RESET WITH CONFIRMATION ----------
    function resetProgress() {
      if (!tree) return;
      showConfirmModal("Are you sure you want to reset all progress? This cannot be undone.", () => {
        unlocked.clear();
        pointsLeft = tree.points;
        applyElementToTree();
        setMessage("Progress reset.");
        updateHUD();
        drawTree();
      });
    }

    // ---------- ELEMENT PICKER ----------
    function createElementPicker() {
      if (document.getElementById("elementPickerContainer")) return;
      const container = document.createElement("div");
      container.className = "element-picker";
      container.id = "elementPickerContainer";
      container.innerHTML = `<label for="elementSelect">Element:</label>`;

      const select = document.createElement("select");
      select.id = "elementSelect";
      ELEMENTS.forEach(el => {
        const opt = document.createElement("option");
        opt.value = el;
        opt.textContent = el;
        if (el === selectedElement) opt.selected = true;
        select.appendChild(opt);
      });

      select.addEventListener("change", () => {
        selectedElement = select.value;
        localStorage.setItem("selectedElement", selectedElement);
        applyElementToTree();
        updateHUD();
        drawTree();
        setMessage(`Element set to "${selectedElement}".`);
      });

      container.appendChild(select);
      document.body.appendChild(container);
    }

    function updateElementPickerVisibility() {
      const container = document.getElementById("elementPickerContainer");
      if (!container) return;
      container.style.display = (tree?.hasElements === false) ? "none" : "";
    }

    // ---------- DEFAULT TREE ----------
    const defaultTree = {
      name: "Starter Tree",
      points: 6,
      nodes: [
        { id: "root", label: "Please load a tree JSON file", cost: 0, requires: [], elements: {} },
      ]
    };

    // ---------- EVENT LISTENERS ----------
    fileInput.addEventListener("change", async (e) => {
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

    progressInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      loadProgress(file);
      progressInput.value = "";
    });

    saveTreeBtn.addEventListener("click", saveTree);
    saveProgressBtn.addEventListener("click", saveProgress);
    resetBtn.addEventListener("click", resetProgress);
    zoomInBtn.addEventListener("click", zoomIn);
    zoomOutBtn.addEventListener("click", zoomOut);
    toggleOverviewBtn.addEventListener("click", () => {
      overviewPanel.classList.toggle("hidden");
      if (!overviewPanel.classList.contains("hidden")) {
          refreshOverview();
      }
    });

    addPointBtn.addEventListener("click", () => {
      if (!tree) return;
      tree.points += 1;
      pointsLeft += 1;
      updateHUD();
      drawTree();
    });

    subPointBtn.addEventListener("click", () => {
      if (!tree) return;
      const spent = tree.points - pointsLeft;
      if (tree.points > spent) {
        tree.points -= 1;
        if (pointsLeft > 0) pointsLeft -= 1;
        else pointsLeft = 0;
        updateHUD();
        drawTree();
      } else {
        setMessage("Cannot remove points: all points are spent.");
      }
    });

    // ---------- START ----------
    createElementPicker();
    requestAnimationFrame(() => loadTree(defaultTree));
    
})();