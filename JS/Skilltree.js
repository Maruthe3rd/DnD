(function(){
    "use strict";

    // ---------- CONSTANTS & GLOBALS ----------
    const ELEMENTS = ["Neutral", "Fire", "Ice", "Lightning", "Nature", "Weird", "Physical", "Wind"];
    const SVG_NS = "http://www.w3.org/2000/svg";

    // DOM elements — create the SVG dynamically since no static <svg id="treeSvg"> exists in the HTML
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
          <p class="effect"><strong>Effect:</strong>unknown...</p>
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


    // ---------- VALIDATION & LAYOUT ----------
    function validateTree(data) {
      if (data && typeof data.treeName === 'string' && Array.isArray(data.unlocked)) {
        throw new Error("This file appears to be a progress JSON, not a tree JSON. Use 'Load progress JSON' instead.");
      }
      if (!data || !Array.isArray(data.nodes)) {
        throw new Error("Invalid tree file: must contain a 'nodes' array at the top level.");
      }
      const ids = new Set();
      for (const node of data.nodes) {
        if (!node.id) throw new Error("Each node must have an 'id' field.");
        if (typeof node.label !== "string") throw new Error(`Node "${node.id}" needs a 'label' string.`);
        if (ids.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`);
        ids.add(node.id);
        node.cost = Number.isFinite(node.cost) ? Math.max(1, node.cost) : 1;
        node.requires = Array.isArray(node.requires) ? node.requires : [];
        if (!node.elements) node.elements = {};
        node.x = Number.isFinite(node.x) ? node.x : undefined;
        node.y = Number.isFinite(node.y) ? node.y : undefined;
      }
      for (const node of data.nodes) {
        for (const req of node.requires) {
          if (!ids.has(req)) throw new Error(`Node "${node.id}" requires unknown id "${req}".`);
        }
      }
      data.name = data.name || "Custom Tree";
      data.points = Number.isFinite(data.points) ? Math.max(0, data.points) : 5;
      return data;
    }

    function applyCardinalLayout(treeData) {
      const container = document.getElementById('skillTreeContainer');
      const WIDTH = (container?.offsetWidth || window.innerWidth || 1200);
      const HEIGHT = (container?.offsetHeight || (window.innerHeight - 56) || 800);
      const CENTER_X = WIDTH / 2, CENTER_Y = HEIGHT / 2;
      const NODE_RADIUS = 50; // collision radius for nodes
      const REPEL_STRENGTH = 500; // repulsion force between nodes
      const LINK_STRENGTH = 0.5; // attraction force along edges

      const byId = Object.fromEntries(treeData.nodes.map(n => [n.id, n]));
      
      // Initialize positions: use custom positions if provided, otherwise randomize
      for (const node of treeData.nodes) {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
          node.x = CENTER_X + (Math.random() - 0.5) * 400;
          node.y = CENTER_Y + (Math.random() - 0.5) * 400;
        }
        node.vx = 0;
        node.vy = 0;
      }

      const root = byId.root || treeData.nodes.find(n => (n.requires || []).length === 0);
      if (root) {
        root.x = CENTER_X;
        root.y = CENTER_Y;
      }

      // Build parent-child relationships
      const childrenMap = new Map();
      for (const n of treeData.nodes) {
        for (const req of (n.requires || [])) {
          if (!childrenMap.has(req)) childrenMap.set(req, []);
          childrenMap.get(req).push(n);
        }
      }

      // Force-directed simulation iterations
      const ITERATIONS = 60;
      for (let iter = 0; iter < ITERATIONS; iter++) {
        // Reset forces
        for (const node of treeData.nodes) {
          node.fx = 0;
          node.fy = 0;
        }

        // Repulsion forces (avoid overlaps)
        for (let i = 0; i < treeData.nodes.length; i++) {
          for (let j = i + 1; j < treeData.nodes.length; j++) {
            const n1 = treeData.nodes[i];
            const n2 = treeData.nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const minDist = NODE_RADIUS * 2;

            if (dist < minDist * 3) {
              const force = REPEL_STRENGTH / (dist * dist);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              n1.fx -= fx;
              n1.fy -= fy;
              n2.fx += fx;
              n2.fy += fy;
            }
          }
        }

        // Attraction forces along edges (children toward parents)
        for (const node of treeData.nodes) {
          for (const reqId of (node.requires || [])) {
            const parent = byId[reqId];
            if (!parent) continue;
            const dx = parent.x - node.x;
            const dy = parent.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const force = dist * LINK_STRENGTH;
            node.fx += (dx / dist) * force;
            node.fy += (dy / dist) * force;
          }
        }

        // Radial push from center to spread nodes
        for (const node of treeData.nodes) {
          if (node === root) continue;
          const dx = node.x - CENTER_X;
          const dy = node.y - CENTER_Y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const radialForce = 50;
          node.fx += (dx / dist) * radialForce;
          node.fy += (dy / dist) * radialForce;
        }

        // Damping and velocity update
        const damping = 0.7;
        for (const node of treeData.nodes) {
          if (node === root) continue; // root stays fixed
          node.vx = (node.vx + node.fx) * damping;
          node.vy = (node.vy + node.fy) * damping;
          node.x += node.vx;
          node.y += node.vy;
        }

        // Boundary constraints
        const margin = 100;
        for (const node of treeData.nodes) {
          node.x = Math.max(margin, Math.min(WIDTH - margin, node.x));
          node.y = Math.max(margin, Math.min(HEIGHT - margin, node.y));
        }
      }
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
      // Attach SVG into the container if not already there
      const container = document.getElementById('skillTreeContainer');
      if (container) {
        if (svg.parentElement !== container) container.appendChild(svg);
        // offsetWidth/Height are reliable after layout; fall back to viewport size
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
      tree = validateTree(structuredClone(data));
      applyCardinalLayout(tree);
      unlocked.clear();
      pointsLeft = tree.points;
      cacheBaseLabels();
      applyElementToTree();
      setMessage(`Loaded "${tree.name}".`);
      updateHUD();
      selectedElement = "Neutral";
      drawTree();
    }

    function saveTree() {
      if (!tree) return;
      const exportTree = {
        name: tree.name,
        points: tree.points,
        nodes: tree.nodes.map(n => ({
          id: n.id,
          x: n.x,
          y: n.y,
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

    // ---------- EXAMPLE TREE ----------
    function generateExampleTree() {
      return {
        name: "Example Elemental Tree",
        points: 8,
        nodes: [
          {
            id: "root",
            label: "Core",
            cost: 1,
            requires: [],
            elements: {
              Neutral: { title: "Core", description: "The foundation of your power.", effect: "Grants 1 skill point." },
              Fire: { title: "Inferno Core", description: "A blazing heart.", effect: "Your fire spells deal +1 damage." },
              Water: { title: "Tidal Core", description: "Fluid and relentless.", effect: "Gain advantage on grapple checks." }
            }
          },
          {
            id: "strength",
            label: "Strength",
            cost: 2,
            requires: ["root"],
            elements: {
              Neutral: { title: "Strength", description: "Raw physical power.", effect: "+1 melee damage." },
              Fire: { title: "Flame Strength", description: "Strength imbued with fire.", effect: "+1 fire damage on melee attacks." },
              Water: { title: "Tidal Strength", description: "Fluid power.", effect: "Push enemies 5ft on hit." }
            }
          },
          {
            id: "wisdom",
            label: "Wisdom",
            cost: 2,
            requires: ["root"],
            elements: {
              Neutral: { title: "Wisdom", description: "Insight and perception.", effect: "+1 to Perception checks." },
              Fire: { title: "Blazing Insight", description: "You see through deception.", effect: "Advantage on Insight checks." },
              Water: { title: "Flowing Wisdom", description: "Calm and adaptable.", effect: "Resistance to psychic damage." }
            }
          }
        ]
      };
    }

        // ---------- ELEMENT PICKER ----------
    function createElementPicker() {
      if (document.title.includes("Martial Arts")) {return}
      const container = document.createElement("div");
      container.className = "element-picker";
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

    // ---------- DEFAULT TREE ----------
    const defaultTree = {
      name: "Starter Tree",
      points: 6,
      nodes: [
        { id: "root", label: "Drück ma load tree", cost: 161, requires: [], elements: {} },
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

    // Points adjustment buttons
    addPointBtn.addEventListener("click", () => {
      if (!tree) return;
      tree.points += 1;
      pointsLeft += 1;
      updateHUD();
      drawTree(); // node availability may change
    });

    subPointBtn.addEventListener("click", () => {
      if (!tree) return;
      // Cannot reduce total points below already spent points
      const spent = tree.points - pointsLeft;
      if (tree.points > spent) {
        tree.points -= 1;
        if (pointsLeft > 0) pointsLeft -= 1;
        else pointsLeft = 0; // should not happen, but safety
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