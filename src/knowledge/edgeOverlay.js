/**
 * 自绘关联线：穿过球体的线段裁掉不画（球可保持半透明光环样式）
 */

/**
 * @param {HTMLElement} container
 */
export function createEdgeOverlay(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'edge-overlay';
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
  const parentStyle = getComputedStyle(container);
  if (parentStyle.position === 'static') container.style.position = 'relative';
  // 夹在 region-overlay 与 cytoscape 画布之间
  const region = container.querySelector('.region-overlay');
  if (region && region.nextSibling) container.insertBefore(canvas, region.nextSibling);
  else container.insertBefore(canvas, container.firstChild);

  const ctx = canvas.getContext('2d');
  /** @type {import('cytoscape').Core | null} */
  let cy = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * 线段与圆相交的 t 区间（相对 [0,1]）
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} cx
   * @param {number} cy
   * @param {number} r
   * @returns {[number, number] | null}
   */
  function overlapTs(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const a = dx * dx + dy * dy;
    if (a < 1e-8) return null;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    let t0 = (-b - s) / (2 * a);
    let t1 = (-b + s) / (2 * a);
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t1 <= 0 || t0 >= 1) return null;
    return [Math.max(0, t0), Math.min(1, t1)];
  }

  /**
   * @param {[number, number][]} intervals
   */
  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    intervals.sort((a, b) => a[0] - b[0]);
    /** @type {[number, number][]} */
    const out = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      const cur = intervals[i];
      const last = out[out.length - 1];
      if (cur[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], cur[1]);
      else out.push(cur);
    }
    return out;
  }

  /**
   * 画被圆洞裁切后的线段
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {{x:number,y:number,r:number}[]} circles
   * @param {number} lineWidth
   */
  function strokeClipped(x1, y1, x2, y2, circles, lineWidth) {
    /** @type {[number, number][]} */
    const blocked = [];
    for (const c of circles) {
      const hit = overlapTs(x1, y1, x2, y2, c.x, c.y, c.r);
      if (hit) blocked.push(hit);
    }
    const merged = mergeIntervals(blocked);
    /** @type {[number, number][]} */
    const visible = [];
    let cursor = 0;
    for (const [a, b] of merged) {
      if (a > cursor + 1e-4) visible.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < 1 - 1e-4) visible.push([cursor, 1]);

    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    for (const [ta, tb] of visible) {
      if (tb - ta < 1e-4) continue;
      ctx.beginPath();
      ctx.moveTo(x1 + (x2 - x1) * ta, y1 + (y2 - y1) * ta);
      ctx.lineTo(x1 + (x2 - x1) * tb, y1 + (y2 - y1) * tb);
      ctx.stroke();
    }
  }

  function paint() {
    resize();
    const w = container.clientWidth;
    const h = container.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!cy || cy.destroyed()) return;

    const pan = cy.pan();
    const zoom = cy.zoom();
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    /** @type {{x:number,y:number,r:number}[]} */
    const circles = [];
    cy.nodes('.category, .detail').forEach((n) => {
      const p = n.position();
      const r = Math.max(n.width(), n.height()) / 2 + 1.5;
      circles.push({ x: p.x, y: p.y, r });
    });

    // 比原先略淡
    ctx.strokeStyle = 'rgba(180, 180, 195, 0.22)';
    const baseW = 2.2 / Math.max(zoom, 0.35);

    cy.edges().forEach((e) => {
      const s = e.source();
      const t = e.target();
      if (!s.nonempty() || !t.nonempty()) return;
      if (s.hasClass('region') || t.hasClass('region')) return;
      const sp = s.position();
      const tp = t.position();
      const wData = Number(e.data('weight')) || 2;
      const lw = baseW * Math.max(0.75, Math.min(1.6, wData / 2.5));
      strokeClipped(sp.x, sp.y, tp.x, tp.y, circles, lw);
    });

    ctx.restore();
  }

  /**
   * @param {import('cytoscape').Core} core
   */
  function bind(core) {
    cy = core;
    paint();
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const onResize = () => paint();
  window.addEventListener('resize', onResize);

  return {
    bind,
    paint,
    clear,
    destroy() {
      window.removeEventListener('resize', onResize);
      canvas.remove();
    },
  };
}
