/*(function(){
    const ELEMENTS = ["Neutral", "Fire", "Ice", "Water", "Earth", "Air", "Lightning", "Shadow", "Light"];
    let selectedElement = localStorage.getItem("selectedElement") || "Neutral";
        

    function getElementFlavor(baseLabel, element) {
        if (element === "Neutral") return baseLabel;
        const prefix = {
        Fire: "Flame", Water: "Tide", Earth: "Stone", Air: "Gale",
        Lightning: "Storm", Shadow: "Umbral", Light: "Radiant",
        Ice: "Frost"
        }[element] || element;
        return `${prefix} ${baseLabel}`;
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
        node.label = elemData.title || getElementFlavor(base, selectedElement);
        node.description = elemData.description || "";
        node.effect = elemData.effect || "";
      }
    }

    // ---------- ELEMENT PICKER ----------
    function createElementPicker() {
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

    function loadTree(data) {
      tree = validateTree(structuredClone(data));
      applyCardinalLayout(tree);
      unlocked.clear();
      pointsLeft = tree.points;
      cacheBaseLabels();
      applyElementToTree();
      setMessage(`Loaded "${tree.name}".`);
      updateHUD();
      drawTree();
    }

// ---------- START ----------    
})();
*/