const imageCache = new Map();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function createGraph(canvas, opts) {
  opts = opts || {};
  const ctx = canvas.getContext("2d");
  const listeners = { select: [], open: [], hover: [], background: [], layoutchange: [] };
  const state = {
    nodes: [],
    edges: [],
    nodeById: new Map(),
    neighbors: new Map(),
    scale: 1,
    tx: 0,
    ty: 0,
    vw: 0,
    vh: 0,
    dpr: 1,
    alpha: 0,
    running: false,
    rafId: null,
    layout: "force",
    radialRoot: null,
    selectedId: opts.selectedId || null,
    hoverId: null,
    highlight: new Set(),
    hiddenIds: new Set(),
    dimOthers: true,
    showLabels: true,
    drag: null,
    pointers: new Map(),
    pinch: null,
    panning: null,
    needsFit: false,
    pendingRefit: false,
    userCamera: false,
    nodeLabels: [],
    link: null,
    longPress: null,
  };

  function emit(evt, payload) {
    for (const fn of listeners[evt] || []) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  }

  function resize() {
    const parent = canvas.parentElement || canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    const wasDegenerate = state.vw <= 2 || state.vh <= 2;
    state.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    state.vw = w;
    state.vh = h;
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(h * state.dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    if (wasDegenerate && state.nodes.length) {
      state.needsFit = true;
      fit();
      return;
    }
    if (!state.userCamera && state.nodes.length && !state.running && !viewHolds()) {
      fit();
      return;
    }
    draw();
  }

  function radiusFor(node) {
    const deg = (state.neighbors.get(node.id) || new Set()).size;
    const base = opts.nodeRadius || 22;
    return base + Math.min(opts.maxRadiusBonus == null ? 12 : opts.maxRadiusBonus, deg * 1.6);
  }

  function visible(node) {
    return !state.hiddenIds.has(node.id);
  }

  function recomputeNeighbors() {
    state.neighbors = new Map(state.nodes.map((n) => [n.id, new Set()]));
    for (const e of state.edges) {
      if (!state.neighbors.has(e.source) || !state.neighbors.has(e.target)) continue;
      state.neighbors.get(e.source).add(e.target);
      state.neighbors.get(e.target).add(e.source);
    }
  }

  function seedPosition(node) {
    const nb = state.neighbors.get(node.id);
    if (nb && nb.size) {
      let sx = 0, sy = 0, c = 0;
      for (const id of nb) {
        const other = state.nodeById.get(id);
        if (other && typeof other.x === "number") { sx += other.x; sy += other.y; c++; }
      }
      if (c) {
        node.x = sx / c + (Math.random() - 0.5) * 40;
        node.y = sy / c + (Math.random() - 0.5) * 40;
        return;
      }
    }
    const a = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 160;
    node.x = Math.cos(a) * r;
    node.y = Math.sin(a) * r;
  }

  function setData(data, opts2) {
    opts2 = opts2 || {};
    const prev = state.nodeById;
    const nextNodes = (data.nodes || []).map((n) => {
      const old = prev.get(n.id);
      const node = Object.assign({}, n);
      node.img = old && old.img ? old.img : null;
      if (old && typeof old.x === "number") {
        node.x = old.x; node.y = old.y; node.vx = 0; node.vy = 0;
      }
      node.r = radiusFor(node);
      return node;
    });
    state.nodes = nextNodes;
    state.nodeById = new Map(nextNodes.map((n) => [n.id, n]));
    state.edges = (data.edges || []).filter((e) => state.nodeById.has(e.source) && state.nodeById.has(e.target));
    if (state.link && !state.nodeById.has(state.link.fromId)) state.link = null;
    if (state.link && state.link.targetId && !state.nodeById.has(state.link.targetId)) state.link.targetId = null;
    if (state.hoverId && !state.nodeById.has(state.hoverId)) state.hoverId = null;
    recomputeNeighbors();
    for (const n of state.nodes) {
      n.r = radiusFor(n);
      if (typeof n.x !== "number") seedPosition(n);
      loadImage(n);
    }
    if (opts2.fit) {
      state.needsFit = true;
      fit();
      wake(0.9);
    } else {
      if (!opts2.keepView) state.pendingRefit = true;
      wake(1);
    }
    draw();
  }

  function loadImage(node) {
    const api = opts.imageLoader;
    if (!api || !node.imageId) return;
    const key = node.imageId + (node.imgKey ? "@" + node.imgKey : "");
    if (imageCache.has(key)) {
      const cached = imageCache.get(key);
      if (cached) node.img = cached;
      return;
    }
    imageCache.set(key, null);
    Promise.resolve(api(node)).then((src) => {
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        imageCache.set(key, img);
        node.img = img;
        draw();
      };
      img.onerror = () => { imageCache.set(key, false); };
      img.src = src;
    }).catch(() => { imageCache.set(key, false); });
  }

  function visibleNodes() {
    return state.nodes.filter(visible);
  }

  function tick() {
    const nodes = visibleNodes();
    const edges = state.edges.filter((e) => state.nodeById.has(e.source) && state.nodeById.has(e.target) && visible(state.nodeById.get(e.source)) && visible(state.nodeById.get(e.target)));
    const anchor = state.layout === "tree" || state.layout === "radial";
    const alpha = state.alpha;
    const cellSize = 130;
    const grid = new Map();
    for (const n of nodes) {
      const cx = Math.floor(n.x / cellSize);
      const cy = Math.floor(n.y / cellSize);
      const key = cx + ":" + cy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(n);
    }
    const repulsion = (opts.repulsion || 2600) * (anchor ? 0.3 : 1);
    for (const n of nodes) {
      let fx = 0, fy = 0;
      const cx = Math.floor(n.x / cellSize);
      const cy = Math.floor(n.y / cellSize);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const bucket = grid.get(gx + ":" + gy);
          if (!bucket) continue;
          for (const m of bucket) {
            if (m === n) continue;
            let dx = n.x - m.x;
            let dy = n.y - m.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
            if (d2 > 160000) continue;
            const d = Math.sqrt(d2);
            const minD = n.r + m.r + 36;
            let f = repulsion / d2;
            if (d < minD) f += (minD - d) * 0.7;
            fx += (dx / d) * f;
            fy += (dy / d) * f;
          }
        }
      }
      n.fx2 = fx;
      n.fy2 = fy;
    }
    for (const n of nodes) {
      n.vx = (n.vx || 0) + n.fx2 * 0.02 * alpha;
      n.vy = (n.vy || 0) + n.fy2 * 0.02 * alpha;
    }
    const idealLen = opts.linkLength || 150;
    for (const e of edges) {
      const a = state.nodeById.get(e.source);
      const b = state.nodeById.get(e.target);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = idealLen + a.r + b.r;
      const k = e.weight || 1;
      const f = (d - target) * 0.006 * k * alpha;
      const ux = dx / d, uy = dy / d;
      a.vx += ux * f; a.vy += uy * f;
      b.vx -= ux * f; b.vy -= uy * f;
    }
    for (const n of nodes) {
      if (anchor && typeof n.ax === "number") {
        const k = 0.34 * Math.max(alpha, 0.35);
        n.vx += (n.ax - n.x) * k;
        n.vy += (n.ay - n.y) * k;
      }
      const pull = anchor ? 0.0012 : 0.0006;
      n.vx -= n.x * pull * alpha;
      n.vy -= n.y * pull * alpha;
    }
    let maxV = 0;
    for (const n of nodes) {
      if (state.drag && state.drag.id === n.id) continue;
      n.vx *= anchor ? 0.55 : 0.78;
      n.vy *= anchor ? 0.55 : 0.78;
      n.x += n.vx;
      n.y += n.vy;
      maxV = Math.max(maxV, Math.abs(n.vx) + Math.abs(n.vy));
    }
    state.alpha = alpha * (anchor ? 0.97 : 0.985);
    const dragging = !!state.drag;
    return dragging || state.alpha > 0.012 || maxV > 0.35;
  }

  function wake(a) {
    state.alpha = Math.max(state.alpha, a == null ? 0.9 : a);
    if (!state.running) {
      state.running = true;
      state.rafId = requestAnimationFrame(loop);
    }
  }

  function loop() {
    state.rafId = null;
    const more = tick();
    draw();
    if (more || state.drag) {
      state.rafId = requestAnimationFrame(loop);
    } else {
      state.running = false;
      if (state.needsFit) {
        state.needsFit = false;
        fit();
      } else if (state.pendingRefit) {
        state.pendingRefit = false;
        if (!state.userCamera) fit();
      }
    }
  }

  function viewHolds() {
    const lm = opts.labelMargin == null ? 22 : opts.labelMargin;
    let ok = true;
    for (const n of state.nodes) {
      if (!visible(n)) continue;
      const [sx, sy] = toScreen(n.x, n.y);
      const r = n.r * state.scale;
      if (sx - r - lm * 0.6 < 0 || sy - r - lm * 0.8 < 0 || sx + r + lm * 0.6 > state.vw || sy + r + lm > state.vh) { ok = false; break; }
    }
    return ok;
  }

  function toScreen(x, y) {
    return [state.tx + x * state.scale, state.ty + y * state.scale];
  }

  function toWorld(sx, sy) {
    return [(sx - state.tx) / state.scale, (sy - state.ty) / state.scale];
  }

  function edgeColor(e) {
    return e.color || "#64748b";
  }

  function draw() {
    const { dpr, vw, vh } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    const bg = opts.background || "rgba(0,0,0,0)";
    if (bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (opts.grid !== false) {
      const step = 64 * state.scale;
      if (step > 18) {
        const ox = ((state.tx % step) + step) % step;
        const oy = ((state.ty % step) + step) % step;
        ctx.fillStyle = opts.gridColor || "rgba(148,163,184,0.14)";
        for (let x = ox; x < vw; x += step) {
          for (let y = oy; y < vh; y += step) ctx.fillRect(x, y, 1.7, 1.7);
        }
      }
    }
    if (opts.drawBackground) opts.drawBackground(ctx, state);

    const focusId = state.hoverId || state.selectedId;
    let focusSet = null;
    if (focusId && state.dimOthers) {
      focusSet = new Set([focusId]);
      for (const id of state.neighbors.get(focusId) || []) focusSet.add(id);
    }

    const placedLabels = [];
    const pendingEdgeLabels = [];
    function overlapsAny(x, y, w, h, pad) {
      pad = pad == null ? 3 : pad;
      for (const r of placedLabels) {
        if (x - pad < r.x + r.w && x + w + pad > r.x && y - pad < r.y + r.h && y + h + pad > r.y) return true;
      }
      return false;
    }
    const circles = [];
    for (const n of state.nodes) {
      if (!visible(n)) continue;
      const [cx, cy] = toScreen(n.x, n.y);
      circles.push({ x: cx, y: cy, r: n.r * state.scale });
    }
    function overlapCost(x, y, w, h) {
      let cost = 0;
      for (const r of placedLabels) {
        const ox = Math.min(x + w, r.x + r.w) - Math.max(x, r.x);
        const oy = Math.min(y + h, r.y + r.h) - Math.max(y, r.y);
        if (ox > 0 && oy > 0) cost += ox * oy;
      }
      return cost;
    }
    function overlapsCircle(x, y, w, h, pad) {
      pad = pad == null ? 4 : pad;
      const cx = x + w / 2, cy = y + h / 2;
      for (const c of circles) {
        const nx = clamp(cx, c.x - c.r, c.x + c.r);
        const ny = clamp(cy, c.y - c.r, c.y + c.r);
        if ((cx - nx) ** 2 + (cy - ny) ** 2 < (pad + 2) ** 2) return true;
      }
      return false;
    }
    function circleCost(x, y, w, h, pad) {
      let cost = 0;
      for (const c of circles) {
        const nx = clamp(c.x, x, x + w), ny = clamp(c.y, y, y + h);
        const clear = Math.sqrt((nx - c.x) ** 2 + (ny - c.y) ** 2) - c.r;
        if (clear < pad) cost += (pad - clear) * (pad - clear) * 90;
      }
      return cost;
    }
    function edgeHash(id) {
      let h = 0;
      const s = String(id);
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    }
    const segments = [];
    function segSeg(x1, y1, x2, y2, x3, y3, x4, y4) {
      const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
      if (!d) return false;
      const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
      const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
      return t >= 0.02 && t <= 0.98 && u >= 0.02 && u <= 0.98;
    }
    function segHitsRect(s, x, y, w, h) {
      const inside = (px, py) => px > x && px < x + w && py > y && py < y + h;
      if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
      return (
        segSeg(s.x1, s.y1, s.x2, s.y2, x, y, x + w, y) ||
        segSeg(s.x1, s.y1, s.x2, s.y2, x + w, y, x + w, y + h) ||
        segSeg(s.x1, s.y1, s.x2, s.y2, x + w, y + h, x, y + h) ||
        segSeg(s.x1, s.y1, s.x2, s.y2, x, y + h, x, y)
      );
    }
    function crossesOtherEdge(rect, exceptId) {
      const pad = -2;
      for (const s of segments) {
        if (s.id === exceptId) continue;
        if (segHitsRect(s, rect.x + pad, rect.y + pad, rect.w - pad * 2, rect.h - pad * 2)) return true;
      }
      return false;
    }

    for (const e of state.edges) {
      const a = state.nodeById.get(e.source);
      const b = state.nodeById.get(e.target);
      if (!a || !b || !visible(a) || !visible(b)) continue;
      const [ax, ay] = toScreen(a.x, a.y);
      const [bx, by] = toScreen(b.x, b.y);
      let dx = bx - ax, dy = by - ay;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / d, uy = dy / d;
      const r1 = a.r * state.scale, r2 = b.r * state.scale;
      const sx1 = ax + ux * (r1 + 1);
      const sy1 = ay + uy * (r1 + 1);
      const sx2 = bx - ux * (r2 + 6);
      const sy2 = by - uy * (r2 + 6);
      segments.push({ id: e.id, x1: sx1, y1: sy1, x2: sx2, y2: sy2 });
      const active = !focusSet || (focusSet.has(e.source) && focusSet.has(e.target));
      ctx.globalAlpha = active ? 0.95 : 0.14;
      ctx.strokeStyle = edgeColor(e);
      ctx.lineWidth = e.width || (active && focusSet ? 2.2 : 1.4);
      if (e.dashed) ctx.setLineDash([5, 5]); else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (e.directed) {
        const ah = 8;
        const ang = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.moveTo(sx2, sy2);
        ctx.lineTo(sx2 - ah * Math.cos(ang - 0.42), sy2 - ah * Math.sin(ang - 0.42));
        ctx.lineTo(sx2 - ah * Math.cos(ang + 0.42), sy2 - ah * Math.sin(ang + 0.42));
        ctx.closePath();
        ctx.fillStyle = edgeColor(e);
        ctx.fill();
      }
      const showLabel = e.label && (focusSet ? active : state.nodes.length <= 12 || state.scale > 1.05);
      if (showLabel) {
        pendingEdgeLabels.push({ e: e, x1: sx1, y1: sy1, x2: sx2, y2: sy2, active: active, priority: e.source === focusId || e.target === focusId });
      }
    }
    ctx.globalAlpha = 1;

    for (const n of state.nodes) {
      if (!visible(n)) continue;
      const [x, y] = toScreen(n.x, n.y);
      const r = n.r * state.scale;
      if (x < -r * 2 || y < -r * 2 || x > state.vw + r * 2 || y > state.vh + r * 2) continue;
      const active = !focusSet || focusSet.has(n.id);
      ctx.globalAlpha = active ? 1 : 0.22;
      if (state.highlight.has(n.id)) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8 + Math.sin(Date.now() / 260) * 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = opts.highlightColor || "#fbbf24";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      if (n.id === state.selectedId) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.save();
      ctx.clip();
      if (n.img && n.img.complete) {
        const iw = n.img.naturalWidth, ih = n.img.naturalHeight;
        const s = Math.max((r * 2) / iw, (r * 2) / ih);
        ctx.drawImage(n.img, x + r - (iw * s) / 2 - r, y + r - (ih * s) / 2 - r, iw * s, ih * s);
      } else {
        const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        grad.addColorStop(0, shade(n.color, 0.28));
        grad.addColorStop(1, shade(n.color, -0.22));
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.font = `${Math.round(r * 0.95)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.icon || "?", x, y + r * 0.06);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = n.color || "#94a3b8";
      ctx.lineWidth = n.id === state.selectedId ? 3 : 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const pendingNodeLabels = [];
    if (state.showLabels) {
      const anchorId = opts.labelAnchorId || (state.layout === "radial" ? state.radialRoot : null);
      const anchorNode = anchorId ? state.nodeById.get(anchorId) : null;
      const anchorPt = anchorNode && visible(anchorNode) ? toScreen(anchorNode.x, anchorNode.y) : null;
      const angDist = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      let centroid = null;
      if (!anchorPt) {
        let sx = 0, sy = 0, cnt = 0;
        for (const n of state.nodes) {
          if (!visible(n)) continue;
          const [px, py] = toScreen(n.x, n.y);
          sx += px; sy += py; cnt++;
        }
        if (cnt > 1) centroid = [sx / cnt, sy / cnt];
      }
      const dirs = [
        { dx: 0, dy: 1, extra: 0 }, { dx: 0, dy: -1, extra: 0 },
        { dx: -1, dy: 0, extra: 0 }, { dx: 1, dy: 0, extra: 0 },
        { dx: 0, dy: 1, extra: 24 }, { dx: 0, dy: -1, extra: 24 },
        { dx: -1, dy: 0, extra: 30 }, { dx: 1, dy: 0, extra: 30 },
        { dx: 0.72, dy: 0.72, extra: 4 }, { dx: 0.72, dy: -0.72, extra: 4 },
        { dx: -0.72, dy: 0.72, extra: 4 }, { dx: -0.72, dy: -0.72, extra: 4 },
        { dx: 0, dy: 1, extra: 50 }, { dx: 0, dy: -1, extra: 50 },
        { dx: -1, dy: 0, extra: 62 }, { dx: 1, dy: 0, extra: 62 },
        { dx: 0, dy: 1, extra: 88 }, { dx: 0, dy: -1, extra: 88 },
        { dx: -1, dy: 0, extra: 104 }, { dx: 1, dy: 0, extra: 104 },
      ];
      const order = state.nodes.filter(visible).slice();
      const degOf = (id) => (state.neighbors.get(id) || new Set()).size;
      const weight = (n) => (n.label || "").length * 7.4 + 20 + degOf(n.id) * 6;
      order.sort((a, b) => {
        if (a.id === focusId) return -1;
        if (b.id === focusId) return 1;
        if (anchorNode) { if (a === anchorNode) return -1; if (b === anchorNode) return 1; }
        return weight(b) - weight(a);
      });
      const lowZoom = state.scale <= 0.75;
      const labelCap = opts.alwaysLabels ? Infinity : (lowZoom ? clamp(Math.round((state.vw * state.vh) / 30000), 4, 30) : Infinity);
      let drawnLabels = 0;
      for (const n of order) {
        if (n.id !== focusId && drawnLabels >= labelCap) continue;
        const [x, y] = toScreen(n.x, n.y);
        const r = n.r * state.scale;
        if (x < -200 || y < -80 || x > state.vw + 200 || y > state.vh + 80) continue;
        const active = !focusSet || focusSet.has(n.id);
        let label = n.label || "";
        if (lowZoom && label.length > 18) {
          const words = label.split(/\s+/);
          let acc = "";
          for (const w of words) {
            const test = acc ? acc + " " + w : w;
            if (test.length > 17) break;
            acc = test;
          }
          label = (acc || label.slice(0, 16)).trim() + "…";
        }
        ctx.font = "600 12.5px ui-sans-serif, system-ui, sans-serif";
        const wrapW = opts.labelWrapWidth || 0;
        const lineH = 16;
        let lines = [label];
        if (wrapW && ctx.measureText(label).width > wrapW) {
          lines = [];
          let cur = "";
          for (const word of label.split(/\s+/)) {
            const test = cur ? cur + " " + word : word;
            if (cur && ctx.measureText(test).width > wrapW) { lines.push(cur); cur = word; }
            else cur = test;
          }
          if (cur) lines.push(cur);
          if (lines.length > 3) { lines = [lines[0], lines.slice(1).join(" ")]; }
        }
        let tw = 0;
        for (const L of lines) tw = Math.max(tw, ctx.measureText(L).width);
        const lw = tw + 14;
        const lh = lines.length > 1 ? lines.length * lineH + 6 : 18;
        let cands = dirs;
        if (anchorPt && n !== anchorNode) {
          const base = Math.atan2(y - anchorPt[1], x - anchorPt[0]);
          cands = dirs.slice().sort((a, b) => angDist(Math.atan2(a.dy, a.dx), base) - angDist(Math.atan2(b.dy, b.dx), base));
        } else if (centroid) {
          const base = Math.atan2(y - centroid[1], x - centroid[0]);
          cands = dirs.slice().sort((a, b) => angDist(Math.atan2(a.dy, a.dx), base) - angDist(Math.atan2(b.dy, b.dx), base));
        }
        let best = null, bestInside = null;
        const ep = 7;
        candLoop: for (let i = 0; i < cands.length; i++) {
          const c = cands[i];
          const offX = c.dx * (r + 15 + lw / 2 + c.extra);
          const offY = c.dy * (r + 15 + lh / 2 + c.extra);
          const baseX = x + offX - lw / 2;
          const baseY = y + offY - lh / 2;
          const variants = [[baseX, baseY, 0]];
          if (c.dx) {
            const cy2 = clamp(baseY, ep, Math.max(ep, state.vh - ep - lh));
            if (Math.abs(cy2 - baseY) > 1) variants.push([baseX, cy2, 30]);
          } else {
            const cx2 = clamp(baseX, ep, Math.max(ep, state.vw - ep - lw));
            if (Math.abs(cx2 - baseX) > 1) variants.push([cx2, baseY, 30]);
          }
          const cx3 = clamp(baseX, ep, Math.max(ep, state.vw - ep - lw));
          const cy3 = clamp(baseY, ep, Math.max(ep, state.vh - ep - lh));
          if (Math.abs(cx3 - baseX) > 1 || Math.abs(cy3 - baseY) > 1) variants.push([cx3, cy3, 40]);
          for (const v of variants) {
            const lx = v[0], ly = v[1];
            let cost = overlapCost(lx, ly, lw, lh) + circleCost(lx, ly, lw, lh, 16) + i * 24 + v[2];
            const over = Math.max(0, ep - lx) + Math.max(0, ep - ly) + Math.max(0, lx + lw - (state.vw - ep)) + Math.max(0, ly + lh - (state.vh - ep));
            if (over > 0) cost += 260 + over * 30;
            if (!best || cost < best.cost) best = { x: lx, y: ly, cost: cost };
            if (over <= 0 && (!bestInside || cost < bestInside.cost)) bestInside = { x: lx, y: ly, cost: cost };
            if (cost === 0) break candLoop;
          }
        }
        if (bestInside) best = bestInside;
        const lx = best.x, ly = best.y;
        placedLabels.push({ x: lx, y: ly, w: lw, h: lh, kind: "node" });
        pendingNodeLabels.push({ n: n, lx: lx, ly: ly, lw: lw, lh: lh, lines: lines, active: active });
        drawnLabels++;
      }
    }

    const edgeLabelStops = [0.5, 0.42, 0.58, 0.36, 0.64, 0.3, 0.7, 0.47, 0.53, 0.44];
    pendingEdgeLabels.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || (b.active ? 1 : 0) - (a.active ? 1 : 0));
    const edgeLabelBudget = focusSet ? 64 : clamp(Math.round((state.vw * state.vh) / 90000), 8, 24);
    let edgeLabelsDrawn = 0;
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const L of pendingEdgeLabels) {
      if (!L.priority && edgeLabelsDrawn >= edgeLabelBudget) continue;
      if (!L.priority && Math.hypot(L.x2 - L.x1, L.y2 - L.y1) < 112) continue;
      const w = ctx.measureText(L.e.label).width + 12;
      const h = 17;
      const start = edgeHash(L.e.id) % edgeLabelStops.length;
      let ex = L.x2 - L.x1, ey = L.y2 - L.y1;
      const elen = Math.sqrt(ex * ex + ey * ey) || 1;
      ex /= elen; ey /= elen;
      const nx = -ey, ny = ex;
      const off = h / 2 + 5;
      const sign0 = edgeHash(L.e.id) % 2 ? 1 : -1;
      let best = null;
      for (let i = 0; i < edgeLabelStops.length; i++) {
        const t = edgeLabelStops[(start + i) % edgeLabelStops.length];
        const bx = L.x1 + (L.x2 - L.x1) * t;
        const by = L.y1 + (L.y2 - L.y1) * t;
        for (let s = 0; s < 2; s++) {
          const sign = s === 0 ? sign0 : -sign0;
          for (let di = 0; di < 2; di++) {
            const o = off + di * 21;
            const rx = bx + nx * o * sign - w / 2;
            const ry = by + ny * o * sign - h / 2;
            if (rx + w < -40 || rx > state.vw + 40 || ry + h < -40 || ry > state.vh + 40) continue;
            let cost = overlapCost(rx, ry, w, h) * 4 + circleCost(rx, ry, w, h, 16) + di * 110;
            const overE = Math.max(0, 6 - rx) + Math.max(0, 6 - ry) + Math.max(0, rx + w - (state.vw - 6)) + Math.max(0, ry + h - (state.vh - 6));
            if (overE > 0) cost += 700 + overE * 50;
            if (cost < 400 && crossesOtherEdge({ x: rx, y: ry, w: w, h: h }, L.e.id)) cost += 420;
            cost += Math.abs(t - 0.5) * 240;
            if (best === null || cost < best.cost) best = { x: rx, y: ry, cost: cost };
          }
        }
      }
      if (best === null) {
        const cx = (L.x1 + L.x2) / 2 + nx * off * sign0, cy = (L.y1 + L.y2) / 2 + ny * off * sign0;
        best = { x: cx - w / 2, y: cy - h / 2 };
      }
      const px = clamp(best.x, 6, Math.max(6, state.vw - 6 - w));
      const py = clamp(best.y, 6, Math.max(6, state.vh - 6 - h));
      if (px + w < -30 || px > state.vw + 30 || py + h < -30 || py > state.vh + 30) continue;
      placedLabels.push({ x: px, y: py, w: w, h: h, kind: "edge" });
      ctx.globalAlpha = L.active ? 1 : 0.16;
      ctx.fillStyle = opts.labelBackground || "rgba(9,12,20,0.9)";
      roundRect(ctx, px, py, w, h, 6.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = opts.labelColor || "#cbd5e1";
      ctx.fillText(L.e.label, px + w / 2, py + h / 2 + 0.5);
      ctx.globalAlpha = 1;
      edgeLabelsDrawn++;
    }

    if (state.showLabels && pendingNodeLabels.length) {
      ctx.font = "600 12.5px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const P of pendingNodeLabels) {
        const n = P.n, lx = P.lx, ly = P.ly, lw = P.lw, lh = P.lh, lines = P.lines, active = P.active;
        ctx.globalAlpha = active ? 1 : 0.2;
        ctx.fillStyle = opts.labelBackground || "rgba(8,11,18,0.9)";
        roundRect(ctx, lx, ly, lw, lh, 7);
        ctx.fill();
        ctx.strokeStyle = active ? (n.color || "rgba(148,163,184,0.5)") : "rgba(148,163,184,0.2)";
        ctx.lineWidth = active ? 1.2 : 1;
        ctx.stroke();
        ctx.fillStyle = n.id === state.selectedId ? "#ffffff" : (opts.labelColor || "#e2e8f0");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (lines.length > 1) {
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], lx + lw / 2, ly + 3 + 16 / 2 + li * 16 + 0.5);
          }
        } else {
          ctx.fillText(lines[0] || "", lx + lw / 2, ly + lh / 2 + 0.5);
        }
        ctx.globalAlpha = 1;
      }
    }
    // ---------- prévia de ligação (botão direito / alça / toque longo) ----------
    ctx.save();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const idle = !state.link && !state.drag && !state.panning && !state.pinch && state.pointers.size === 0;
    if (idle && state.hoverId && state.scale >= 0.25) {
      const hn = state.nodeById.get(state.hoverId);
      if (hn && visible(hn)) {
        const h = linkHandleFor(hn);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,14,24,0.9)";
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(167,139,250,0.85)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#c4b5fd";
        ctx.font = `600 ${Math.round(h.r * 1.2)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u{1F517}", h.x, h.y + 1);
      }
    }

    if (state.link) {
      const l = state.link;
      const a = state.nodeById.get(l.fromId);
      if (a) {
        const [ax, ay] = toScreen(a.x, a.y);
        const ar = a.r * state.scale;
        const tn = l.targetId ? state.nodeById.get(l.targetId) : null;
        let tx = l.x, ty = l.y, tr = 0;
        if (tn) {
          const p = toScreen(tn.x, tn.y);
          tx = p[0]; ty = p[1]; tr = tn.r * state.scale;
        }
        ctx.beginPath();
        ctx.arc(ax, ay, ar + 7 + Math.sin(Date.now() / 200) * 2, 0, Math.PI * 2);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(167,139,250,0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        let dx = tx - ax, dy = ty - ay;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        const sx1 = ax + ux * (ar + 3), sy1 = ay + uy * (ar + 3);
        const ex = tx - ux * (tr + 4), ey = ty - uy * (tr + 4);
        const bow = clamp(dist * 0.14, 0, 46);
        const cx = (sx1 + ex) / 2 - uy * bow, cy = (sy1 + ey) / 2 + ux * bow;
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.strokeStyle = tn ? "#a78bfa" : "rgba(203,213,225,0.85)";
        ctx.lineWidth = tn ? 3 : 2.2;
        if (!tn) ctx.setLineDash([7, 6]);
        ctx.shadowColor = "rgba(167,139,250,0.7)";
        ctx.shadowBlur = tn ? 14 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);

        if (tn) {
          ctx.beginPath();
          ctx.arc(tx, ty, tr + 7, 0, Math.PI * 2);
          ctx.strokeStyle = "#a78bfa";
          ctx.lineWidth = 3;
          ctx.stroke();
          const ang = Math.atan2(ey - cy, ex - cx);
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - 12 * Math.cos(ang - 0.4), ey - 12 * Math.sin(ang - 0.4));
          ctx.lineTo(ex - 12 * Math.cos(ang + 0.4), ey - 12 * Math.sin(ang + 0.4));
          ctx.closePath();
          ctx.fillStyle = "#a78bfa";
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(l.x, l.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#cbd5e1";
          ctx.fill();
          if (state.scale >= 0.4) {
            const msg = "Solte sobre outra ficha";
            ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
            const w = ctx.measureText(msg).width + 18;
            const h = 24;
            let px = l.x + 14, py = l.y + 12;
            px = clamp(px, 6, Math.max(6, state.vw - 6 - w));
            py = clamp(py, 6, Math.max(6, state.vh - 6 - h));
            ctx.fillStyle = "rgba(9,12,20,0.92)";
            roundRect(ctx, px, py, w, h, 7);
            ctx.fill();
            ctx.strokeStyle = "rgba(167,139,250,0.55)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "#ddd6fe";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(msg, px + w / 2, py + h / 2 + 0.5);
          }
        }
      }
    }
    ctx.restore();

    state.nodeLabels = placedLabels.slice();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function shade(color, amt) {
    const c = parseColor(color);
    if (!c) return color;
    const f = (v) => clamp(Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255);
    return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
  }

  function parseColor(color) {
    if (!color) return null;
    if (color[0] === "#") {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split("").map((h) => h + h).join("");
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map((v) => parseFloat(v));
    return null;
  }

  function hitTest(sx, sy) {
    let best = null;
    for (const n of state.nodes) {
      if (!visible(n)) continue;
      const [x, y] = toScreen(n.x, n.y);
      const r = n.r * state.scale + 4;
      const d = Math.hypot(sx - x, sy - y);
      if (d <= r && (!best || d < best.d)) best = { node: n, d };
    }
    return best ? best.node : null;
  }

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  // ---------- ligar fichas arrastando (botão direito, alça ou toque longo) ----------

  function linkHandleFor(node) {
    const [x, y] = toScreen(node.x, node.y);
    const r = node.r * state.scale;
    const k = r * 0.74;
    return { x: x + k, y: y - k, r: clamp(r * 0.44, 9, 15) };
  }

  function linkHandleAt(sx, sy) {
    if (state.scale < 0.25) return null;
    for (const n of state.nodes) {
      if (!visible(n)) continue;
      const h = linkHandleFor(n);
      if (Math.hypot(sx - h.x, sy - h.y) <= h.r + 2) return n;
    }
    return null;
  }

  function startLink(id, sx, sy) {
    // Num Codex publicado (somente leitura) nem começa o gesto de ligar fichas.
    if (opts.linkable === false) return;
    if (!state.nodeById.get(id)) return;
    state.drag = null;
    state.panning = null;
    state.pinch = null;
    state.pointers.clear();
    clearLongPress();
    state.link = { fromId: id, x: sx, y: sy, sx, sy, targetId: null, moved: 0 };
    canvas.style.cursor = "crosshair";
    emit("linkstart", { id });
    wake(0.25);
    draw();
  }

  function endLink(commit) {
    const l = state.link;
    if (!l) return;
    state.link = null;
    canvas.style.cursor = state.hoverId ? "pointer" : "grab";
    if (commit && l.targetId && l.targetId !== l.fromId) {
      emit("link", { from: l.fromId, to: l.targetId });
    } else if (commit && l.moved < 6) {
      emit("nodemenu", { id: l.fromId, x: l.sx, y: l.sy });
    }
    draw();
  }

  function clearLongPress() {
    if (state.longPress) {
      clearTimeout(state.longPress.timer);
      state.longPress = null;
    }
  }

  function onPointerDown(e) {
    if (e.button === 2) {
      const [sx, sy] = localPoint(e);
      const node = hitTest(sx, sy);
      if (!node) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      state.pointers.set(e.pointerId, { sx, sy });
      startLink(node.id, sx, sy);
      return;
    }
    if (e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    state.needsFit = false;
    state.pendingRefit = false;
    const [sx, sy] = localPoint(e);
    state.pointers.set(e.pointerId, { sx, sy });
    if (state.pointers.size === 2) {
      clearLongPress();
      const pts = [...state.pointers.values()];
      state.pinch = {
        d: Math.hypot(pts[0].sx - pts[1].sx, pts[0].sy - pts[1].sy),
        scale: state.scale,
        mid: [(pts[0].sx + pts[1].sx) / 2, (pts[0].sy + pts[1].sy) / 2],
        tx: state.tx,
        ty: state.ty,
      };
      state.drag = null;
      state.panning = null;
      return;
    }
    const handle = linkHandleAt(sx, sy);
    if (handle) {
      state.pointers.delete(e.pointerId);
      startLink(handle.id, sx, sy);
      return;
    }
    const node = hitTest(sx, sy);
    if (node) {
      const [wx, wy] = toWorld(sx, sy);
      state.drag = { id: node.id, moved: 0, offX: node.x - wx, offY: node.y - wy, sx, sy };
      if (e.pointerType !== "mouse") {
        clearLongPress();
        state.longPress = {
          id: node.id,
          sx, sy,
          timer: setTimeout(() => {
            state.longPress = null;
            if (state.drag && state.drag.id === node.id && state.drag.moved < 9) {
              startLink(node.id, sx, sy);
              if (navigator.vibrate) { try { navigator.vibrate(30); } catch (err) {} }
            }
          }, 460),
        };
      }
      emit("select", { id: node.id, source: "pointer" });
      wake(0.5);
    } else {
      state.panning = { sx, sy, tx: state.tx, ty: state.ty, moved: 0 };
    }
  }

  function onPointerMove(e) {
    const [sx, sy] = localPoint(e);
    if (state.pointers.has(e.pointerId)) state.pointers.set(e.pointerId, { sx, sy });
    if (state.link) {
      const l = state.link;
      l.x = sx; l.y = sy;
      l.moved = Math.max(l.moved, Math.hypot(sx - l.sx, sy - l.sy));
      const hit = hitTest(sx, sy);
      const tid = hit && hit.id !== l.fromId ? hit.id : null;
      if (tid !== l.targetId) l.targetId = tid;
      draw();
      return;
    }
    if (state.longPress && Math.hypot(sx - state.longPress.sx, sy - state.longPress.sy) > 9) clearLongPress();
    if (state.pinch && state.pointers.size >= 2) {
      const pts = [...state.pointers.values()];
      const d = Math.hypot(pts[0].sx - pts[1].sx, pts[0].sy - pts[1].sy);
      const factor = clamp(d / (state.pinch.d || 1), 0.25, 4);
      const next = clamp(state.pinch.scale * factor, 0.12, 4);
      const mid = [(pts[0].sx + pts[1].sx) / 2, (pts[0].sy + pts[1].sy) / 2];
      const scaleRatio = next / state.pinch.scale;
      state.tx = mid[0] - (state.pinch.mid[0] - state.pinch.tx) * scaleRatio;
      state.ty = mid[1] - (state.pinch.mid[1] - state.pinch.ty) * scaleRatio;
      state.scale = next;
      draw();
      return;
    }
    if (state.drag) {
      const node = state.nodeById.get(state.drag.id);
      if (!node) return;
      const [wx, wy] = toWorld(sx, sy);
      node.x = wx + state.drag.offX;
      node.y = wy + state.drag.offY;
      node.vx = 0; node.vy = 0;
      if (typeof node.ax === "number") { node.ax = node.x; node.ay = node.y; }
      state.drag.moved = Math.hypot(sx - state.drag.sx, sy - state.drag.sy);
      wake(0.35);
      draw();
      return;
    }
    if (state.panning) {
      state.tx = state.panning.tx + (sx - state.panning.sx);
      state.ty = state.panning.ty + (sy - state.panning.sy);
      state.panning.moved = Math.hypot(sx - state.panning.sx, sy - state.panning.sy);
      if (state.panning.moved > 3) state.userCamera = true;
      draw();
      return;
    }
    const node = hitTest(sx, sy);
    const id = node ? node.id : null;
    if (id !== state.hoverId) {
      state.hoverId = id;
      emit("hover", { id });
      draw();
    }
    const overHandle = linkHandleAt(sx, sy);
    canvas.style.cursor = overHandle ? "crosshair" : (id ? "pointer" : "grab");
  }

  function onPointerUp(e) {
    state.pointers.delete(e.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
    const cancelled = e.type === "pointercancel";
    clearLongPress();
    if (state.link) {
      const l = state.link;
      if (!cancelled) {
        const [sx, sy] = localPoint(e);
        const hit = hitTest(sx, sy);
        l.x = sx; l.y = sy;
        l.targetId = hit && hit.id !== l.fromId ? hit.id : null;
        l.moved = Math.max(l.moved, Math.hypot(sx - l.sx, sy - l.sy));
      }
      endLink(!cancelled);
      return;
    }
    if (state.drag) {
      const node = state.nodeById.get(state.drag.id);
      const moved = state.drag.moved;
      state.drag = null;
      wake(0.4);
      if (moved < 4 && node) emit("select", { id: node.id, source: "click" });
      draw();
      return;
    }
    if (state.panning) {
      const moved = state.panning.moved;
      state.panning = null;
      if (moved < 4) emit("background", {});
      draw();
    }
  }

  function onWheel(e) {
    e.preventDefault();
    state.pendingRefit = false;
    const [sx, sy] = localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0016);
    zoomAt(sx, sy, factor);
  }

  function zoomAt(sx, sy, factor) {
    state.userCamera = true;
    const next = clamp(state.scale * factor, 0.1, 4.5);
    const ratio = next / state.scale;
    state.tx = sx - (sx - state.tx) * ratio;
    state.ty = sy - (sy - state.ty) * ratio;
    state.scale = next;
    draw();
  }

  function onDblClick(e) {
    const [sx, sy] = localPoint(e);
    const node = hitTest(sx, sy);
    if (node) {
      emit("open", { id: node.id });
      emit("select", { id: node.id, source: "dblclick" });
    } else {
      fit();
    }
  }

  function fit(padding) {
    padding = padding == null ? clamp(Math.round(Math.min(state.vw, state.vh) * 0.14), 22, 70) : padding;
    const lm = opts.labelMargin == null ? 22 : opts.labelMargin;
    state.userCamera = false;
    const nodes = visibleNodes();
    if (!nodes.length) { state.scale = 1; state.tx = state.vw / 2; state.ty = state.vh / 2; draw(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.r - lm * 0.55);
      maxX = Math.max(maxX, n.x + n.r + lm * 0.55);
      minY = Math.min(minY, n.y - n.r - lm * 0.8);
      maxY = Math.max(maxY, n.y + n.r + lm);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = clamp(Math.min((state.vw - padding * 2) / w, (state.vh - padding * 2) / h), 0.12, 1.8);
    state.scale = scale;
    state.tx = state.vw / 2 - ((minX + maxX) / 2) * scale;
    state.ty = state.vh / 2 - ((minY + maxY) / 2) * scale;
    draw();
  }

  function centerOn(id, scale) {
    const node = state.nodeById.get(id);
    if (!node) return;
    if (scale) state.scale = scale;
    state.tx = state.vw / 2 - node.x * state.scale;
    state.ty = state.vh / 2 - node.y * state.scale;
    draw();
  }

  function setLayout(mode) {
    if (mode === state.layout) return;
    state.layout = mode;
    if (mode !== "radial") state.radialRoot = null;
    if (mode === "tree") {
      const ok = treeLayout();
      emit("layoutchange", { mode, fallback: !ok });
      wake(0.45);
    } else {
      state.pendingRefit = true;
      wake(0.9);
    }
    draw();
  }

  function setRadial(rootId) {
    const ok = radialLayout(rootId);
    if (ok) {
      state.layout = "radial";
      state.radialRoot = rootId;
      wake(0.5);
    }
    draw();
    return ok;
  }

  function radialLayout(rootId) {
    const nodes = visibleNodes();
    const root = state.nodeById.get(rootId);
    if (!nodes.length || !root) return false;
    const dist = new Map([[rootId, 0]]);
    const queue = [rootId];
    while (queue.length) {
      const cur = queue.shift();
      const d = dist.get(cur);
      for (const nb of state.neighbors.get(cur) || []) {
        if (dist.has(nb)) continue;
        dist.set(nb, d + 1);
        queue.push(nb);
      }
    }
    const rings = new Map();
    for (const n of nodes) {
      const d = dist.has(n.id) ? dist.get(n.id) : 1;
      if (!d) continue;
      if (!rings.has(d)) rings.set(d, []);
      rings.get(d).push(n);
    }
    root.ax = 0;
    root.ay = 0;
    let prevR = 0;
    const keys = [...rings.keys()].sort((a, b) => a - b);
    let prevRing = null;
    for (const d of keys) {
      const ring = rings.get(d);
      if (prevRing) {
        const posIndex = new Map(prevRing.map((n, i) => [n.id, i]));
        ring.sort((a, b) => {
          const pa = avgNeighborIndex(a, posIndex);
          const pb = avgNeighborIndex(b, posIndex);
          return pa - pb;
        });
      }
      let need = 0;
      for (const n of ring) need += n.r * 2 + 30;
      const R = Math.max(prevR + 105, need / (2 * Math.PI));
      ring.forEach((n, i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        n.ax = Math.cos(a) * R;
        n.ay = Math.sin(a) * R;
      });
      prevR = R;
      prevRing = ring;
    }
    for (const n of nodes) {
      n.x = n.ax;
      n.y = n.ay;
      n.vx = 0;
      n.vy = 0;
    }
    return true;
  }

  function avgNeighborIndex(node, posIndex) {
    let sum = 0, count = 0;
    for (const id of state.neighbors.get(node.id) || []) {
      if (posIndex.has(id)) { sum += posIndex.get(id); count++; }
    }
    return count ? sum / count : 9999;
  }

  function treeLayout() {
    const nodes = visibleNodes();
    if (!nodes.length) return false;
    const genEdges = state.edges.filter((e) => e.genStep);
    const spouseEdges = state.edges.filter((e) => e.genSame);
    if (!genEdges.length) {
      return false;
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of genEdges) {
      if (!adj.has(e.source) || !adj.has(e.target)) continue;
      adj.get(e.source).push({ id: e.target, delta: e.genStep });
      adj.get(e.target).push({ id: e.source, delta: -e.genStep });
    }
    for (const e of spouseEdges) {
      if (!adj.has(e.source) || !adj.has(e.target)) continue;
      adj.get(e.source).push({ id: e.target, delta: 0 });
      adj.get(e.target).push({ id: e.source, delta: 0 });
    }
    const gen = new Map();
    const components = [];
    const order = nodes.slice().sort((a, b) => (state.neighbors.get(b.id) || new Set()).size - (state.neighbors.get(a.id) || new Set()).size);
    for (const seed of order) {
      if (gen.has(seed.id)) continue;
      const compNodes = [];
      const queue = [seed.id];
      gen.set(seed.id, 0);
      compNodes.push(seed.id);
      while (queue.length) {
        const cur = queue.shift();
        const curGen = gen.get(cur);
        for (const nb of adj.get(cur) || []) {
          if (!byId.has(nb.id) || gen.has(nb.id)) continue;
          gen.set(nb.id, curGen + nb.delta);
          compNodes.push(nb.id);
          queue.push(nb.id);
        }
      }
      components.push(compNodes);
    }
    for (const n of nodes) if (!gen.has(n.id)) gen.set(n.id, 0);
    let minGen = Infinity;
    for (const g of gen.values()) minGen = Math.min(minGen, g);
    for (const n of nodes) gen.set(n.id, gen.get(n.id) - minGen);
    const maxGen = Math.max(...[...gen.values()]);
    const levels = [];
    for (let i = 0; i <= maxGen; i++) levels.push([]);
    for (const n of nodes) levels[gen.get(n.id)].push(n);
    const aspect = state.vw / Math.max(1, state.vh);
    const portraitT = clamp((1.6 - aspect) / 0.9, 0, 1);
    const xSpacing = 200 - 60 * portraitT;
    const ySpacing = 190 + 60 * portraitT;
    const compOf = new Map();
    components.forEach((comp, i) => comp.forEach((id) => compOf.set(id, i)));
    const degreeOf = (id) => (state.neighbors.get(id) || new Set()).size;
    const multi = components.filter((c) => c.length > 1);
    const looseIds = components.filter((c) => c.length === 1).map((c) => c[0]);
    const looseSet = new Set(looseIds);
    for (let li = 0; li < levels.length; li++) {
      const level = levels[li];
      level.sort((a, b) => {
        const ca = compOf.get(a.id), cb = compOf.get(b.id);
        if (ca !== cb) return ca - cb;
        return degreeOf(b.id) - degreeOf(a.id);
      });
    }
    for (let sweep = 0; sweep < 3; sweep++) {
      for (let li = 1; li < levels.length; li++) reorder(levels[li], levels[li - 1]);
      for (let li = levels.length - 2; li >= 0; li--) reorder(levels[li], levels[li + 1]);
    }
    const compOffset = new Map();
    let offset = 0;
    for (const comp of multi) {
      const idx = compOf.get(comp[0]);
      let maxCount = 1;
      for (const id of comp) {
        const inLevel = levels[gen.get(id)].filter((n) => compOf.get(n.id) === idx).length;
        maxCount = Math.max(maxCount, inLevel);
      }
      compOffset.set(idx, offset);
      offset += maxCount * xSpacing + xSpacing * 0.9;
    }
    let treeWidth = 0;
    for (let li = 0; li < levels.length; li++) {
      let runComp = -1;
      let runIdx = 0;
      for (const n of levels[li]) {
        if (looseSet.has(n.id)) continue;
        const comp = compOf.get(n.id);
        if (comp !== runComp) { runComp = comp; runIdx = 0; }
        n.ax = (compOffset.get(comp) || 0) + runIdx * xSpacing;
        n.ay = li * ySpacing;
        treeWidth = Math.max(treeWidth, n.ax);
        runIdx++;
      }
    }
    const perRow = 6;
    looseIds.forEach((id, i) => {
      const n = byId.get(id);
      if (!n) return;
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const countInRow = Math.min(perRow, looseIds.length - row * perRow);
      n.ax = treeWidth / 2 + (col - (countInRow - 1) / 2) * xSpacing;
      n.ay = (levels.length + row) * ySpacing;
    });
    for (const n of nodes) {
      n.x = n.ax;
      n.y = n.ay;
      n.vx = 0;
      n.vy = 0;
    }
    fit();
    return true;
  }

  function componentOf(id, components) {
    for (let i = 0; i < components.length; i++) if (components[i].includes(id)) return i;
    return 0;
  }

  function reorder(level, refLevel) {
    const refIndex = new Map(refLevel.map((n, i) => [n.id, i]));
    const bary = new Map();
    for (const n of level) {
      let sum = 0, count = 0;
      const [x1, y1] = [n.x, n.y];
      sum = x1; count = 1;
      for (const id of state.neighbors.get(n.id) || []) {
        if (refIndex.has(id)) { sum += refIndex.get(id); count++; }
      }
      bary.set(n.id, sum / count);
    }
    level.sort((a, b) => bary.get(a.id) - bary.get(b.id));
  }

  function highlight(ids) {
    state.highlight = new Set(ids || []);
    draw();
  }

  function setSelected(id) {
    state.selectedId = id;
    draw();
  }

  function setHidden(ids) {
    state.hiddenIds = new Set(ids || []);
    recomputeNeighbors();
    state.alpha = Math.max(state.alpha, 0.7);
    wake(0.7);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDblClick);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas.parentElement || canvas);
  window.addEventListener("resize", resize);
  const sizeWatch = setInterval(() => {
    const p = canvas.parentElement || canvas;
    if (!p) return;
    const w = p.clientWidth, h = p.clientHeight;
    if (w < 2 || h < 2) return;
    if (Math.abs(w - state.vw) > 1 || Math.abs(h - state.vh) > 1) resize();
  }, 600);
  resize();

  return {
    state,
    setData,
    setLayout,
    setRadial,
    fit,
    centerOn,
    zoomAt,
    highlight,
    setSelected,
    setHidden,
    wake,
    draw,
    resize,
    on(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
      return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); };
    },
    destroy() {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      if (ro) ro.disconnect();
      clearInterval(sizeWatch);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
    },
  };
}
