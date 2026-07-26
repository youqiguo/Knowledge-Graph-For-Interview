/**
 * 外部分区可视化：非闭合交界带
 * - 分界线 = 贴着本类核心簇外缘的圆弧（绕核心走，不是弦/直线）
 * - 向外部一侧做类别色短渐变（不画闭合色块）
 */

/**
 * @typedef {{
 *   catId: string,
 *   color: string,
 *   label: string,
 *   localIds: string[],
 *   externalIds: string[],
 * }} RegionBand
 */

/**
 * @param {HTMLElement} container
 */
export function createRegionOverlay(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'region-overlay';
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  const parentStyle = getComputedStyle(container);
  if (parentStyle.position === 'static') container.style.position = 'relative';
  // 插到容器最底层；cytoscape 画布后挂载并抬高 z-index
  container.insertBefore(canvas, container.firstChild);
  const ctx = canvas.getContext('2d');

  /** @type {import('cytoscape').Core | null} */
  let cy = null;
  /** @type {RegionBand[]} */
  let bands = [];

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
   * @param {string} hex
   * @param {number} a
   */
  function hexAlpha(hex, a) {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return `rgba(180,180,200,${a})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /**
   * @param {import('cytoscape').Core} core
   * @param {string[]} ids
   */
  function clusterOf(core, ids) {
    let x = 0;
    let y = 0;
    let n = 0;
    /** @type {{x:number,y:number,r:number}[]} */
    const pts = [];
    for (const id of ids) {
      const node = core.getElementById(id);
      if (!node.nonempty()) continue;
      const p = node.position();
      const r = Math.max(node.width(), node.height()) / 2;
      pts.push({ x: p.x, y: p.y, r });
      x += p.x;
      y += p.y;
      n++;
    }
    if (!n) return null;
    x /= n;
    y /= n;
    // 球体外缘（不含大块标签，避免分界线被撑得太远）
    let maxR = 0;
    for (const p of pts) {
      maxR = Math.max(maxR, Math.hypot(p.x - x, p.y - y) + p.r);
    }
    return { x, y, maxR, pts, count: n };
  }

  /**
   * 在给定朝向扇区内，本类节点实际外缘半径（贴边，而不是整圆 maxR）
   * @param {{x:number,y:number,pts:{x:number,y:number,r:number}[]}} local
   * @param {number} mid
   * @param {number} half
   */
  function sectorOuterRadius(local, mid, half) {
    let maxR = 0;
    const pad = half + 0.35;
    for (const p of local.pts) {
      const ang = Math.atan2(p.y - local.y, p.x - local.x);
      let d = ang - mid;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > pad) continue;
      maxR = Math.max(maxR, Math.hypot(p.x - local.x, p.y - local.y) + p.r);
    }
    // 扇区内若几乎无点，回退全簇
    return maxR > 8 ? maxR : local.maxR;
  }

  /**
   * 相对本类中心，外部点的角度跨度
   * @param {import('cytoscape').Core} core
   * @param {{x:number,y:number}} origin
   * @param {string[]} ids
   */
  function angularSpan(core, origin, ids) {
    const angles = [];
    for (const id of ids) {
      const node = core.getElementById(id);
      if (!node.nonempty()) continue;
      const p = node.position();
      angles.push(Math.atan2(p.y - origin.y, p.x - origin.x));
    }
    if (!angles.length) return { mid: 0, half: Math.PI / 5, start: -Math.PI / 5, end: Math.PI / 5 };
    angles.sort((a, b) => a - b);
    let bestGap = -1;
    let bestI = 0;
    for (let i = 0; i < angles.length; i++) {
      const next = angles[(i + 1) % angles.length] + (i + 1 === angles.length ? Math.PI * 2 : 0);
      const gap = next - angles[i];
      if (gap > bestGap) {
        bestGap = gap;
        bestI = i;
      }
    }
    const start = angles[(bestI + 1) % angles.length];
    let end = angles[bestI];
    if (bestI === angles.length - 1) end += Math.PI * 2;
    const span = Math.PI * 2 - bestGap;
    const mid = start + span / 2;
    const half = Math.max(0.28, Math.min(1.05, span / 2 + 0.18));
    return { mid, half, start: mid - half, end: mid + half };
  }

  /**
   * 沿核心外缘画圆弧路径
   * @param {CanvasRenderingContext2D} c
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} a0
   * @param {number} a1
   */
  function arcPath(c, cx, cy, radius, a0, a1) {
    const steps = Math.max(12, Math.ceil(Math.abs(a1 - a0) / 0.08));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + (a1 - a0) * t;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  }

  function paint() {
    resize();
    const w = container.clientWidth;
    const h = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!cy || !bands.length) return;

    const pan = cy.pan();
    const zoom = cy.zoom();
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    for (const band of bands) {
      const local = clusterOf(cy, band.localIds);
      const ext = clusterOf(cy, band.externalIds);
      if (!local || !ext) continue;

      let dx = ext.x - local.x;
      let dy = ext.y - local.y;
      let dist = Math.hypot(dx, dy);
      if (dist < 1) {
        dx = 1;
        dy = 0;
        dist = 1;
      }
      const ux = dx / dist;
      const uy = dy / dist;

      const { mid, half, start, end } = angularSpan(cy, local, band.externalIds);
      // 分界线画在「本类外缘 ↔ 外部内缘」间隙里（偏外部一侧），避免贴核心却离外部分区很远
      const hugR = sectorOuterRadius(local, mid, half);
      const localOuter = hugR + 16;
      const extInner = dist - ext.maxR - 14;
      if (!(extInner > localOuter + 16)) continue;
      const arcR = localOuter * 0.35 + extInner * 0.65;
      const fadeLen = Math.max(24, Math.min(72, extInner - arcR));
      const outerR = arcR + fadeLen;

      // 渐变扇环：内侧贴核心弧，外侧淡出
      ctx.beginPath();
      arcPath(ctx, local.x, local.y, arcR, start, end);
      // 外侧反向弧
      const steps = Math.max(12, Math.ceil(Math.abs(end - start) / 0.08));
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const a = start + (end - start) * t;
        const x = local.x + Math.cos(a) * outerR;
        const y = local.y + Math.sin(a) * outerR;
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      const bx = local.x + ux * arcR;
      const by = local.y + uy * arcR;
      const grad = ctx.createLinearGradient(bx, by, bx + ux * fadeLen, by + uy * fadeLen);
      grad.addColorStop(0, hexAlpha(band.color, 0.34));
      grad.addColorStop(0.55, hexAlpha(band.color, 0.12));
      grad.addColorStop(1, hexAlpha(band.color, 0));
      ctx.fillStyle = grad;
      ctx.fill();

      // 加粗圆弧分界线（真正的曲线，绕核心边缘）
      ctx.beginPath();
      arcPath(ctx, local.x, local.y, arcR, start, end);
      ctx.strokeStyle = hexAlpha(band.color, 0.92);
      ctx.lineWidth = 4.2 / Math.max(zoom, 0.35);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // 标签：外部质心外侧
      if (band.label) {
        const lx = ext.x + ux * (ext.maxR + 36);
        const ly = ext.y + uy * (ext.maxR + 36);
        ctx.font = '500 12px "IBM Plex Sans","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(band.label).width;
        const pad = 8;
        ctx.fillStyle = 'rgba(12,12,16,0.82)';
        ctx.strokeStyle = hexAlpha(band.color, 0.75);
        ctx.lineWidth = 1.2 / Math.max(zoom, 0.35);
        roundRect(ctx, lx - tw / 2 - pad, ly - 10, tw + pad * 2, 20, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(235,235,242,0.95)';
        ctx.fillText(band.label, lx, ly);
      }
    }

    ctx.restore();
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

  /**
   * @param {import('cytoscape').Core} core
   * @param {RegionBand[]} next
   */
  function setBands(core, next) {
    cy = core;
    bands = next || [];
    paint();
  }

  function clear() {
    bands = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const onResize = () => paint();
  window.addEventListener('resize', onResize);

  return {
    setBands,
    clear,
    paint,
    destroy() {
      window.removeEventListener('resize', onResize);
      canvas.remove();
    },
  };
}

/**
 * 强制外部分区节点远离本类簇
 * @param {Map<string, { x: number, y: number, size?: number }>} positions
 * @param {string[]} localIds
 * @param {string[]} externalIds
 * @param {number} [gap] 本类外包络到外部节点的额外间距
 */
export function enforceExternalDistance(positions, localIds, externalIds, gap = 200) {
  const core = localCluster(positions, localIds);
  if (!core) return;

  const minDist = core.outer + gap;
  for (const id of externalIds) {
    const p = positions.get(id);
    if (!p) continue;
    let dx = p.x - core.x;
    let dy = p.y - core.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1e-3) {
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const need = minDist + (p.size || 30) / 2;
    if (dist < need) {
      const s = need / dist;
      p.x = core.x + dx * s;
      p.y = core.y + dy * s;
    }
  }
}

/**
 * 把同组（同外部类别）节点收拢到组质心附近，避免同分区分得太散
 * @param {Map<string, { x: number, y: number, size?: number }>} positions
 * @param {Iterable<string[]>} groups
 * @param {number} [pull=0.55] 向质心收拢比例（越大越紧）
 */
export function compactGroups(positions, groups, pull = 0.55) {
  for (const ids of groups) {
    if (!ids || ids.length < 2) continue;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const id of ids) {
      const p = positions.get(id);
      if (!p) continue;
      cx += p.x;
      cy += p.y;
      n++;
    }
    if (n < 2) continue;
    cx /= n;
    cy /= n;
    const keep = Math.max(0.15, 1 - pull);
    for (const id of ids) {
      const p = positions.get(id);
      if (!p) continue;
      p.x = cx + (p.x - cx) * keep;
      p.y = cy + (p.y - cy) * keep;
    }
  }
}

/**
 * 将有跨簇关联的外部点拉到「相关本类点」方向上的近侧，缩短超长关联线
 * @deprecated 易把不同外部分区吸到同一角度；优先用 snapExternalsToSectors
 * @param {Map<string, { x: number, y: number, size?: number }>} positions
 * @param {Map<string, string[]>} relatedLocalByExt extId -> localIds
 * @param {string[]} localIds
 * @param {string[]} externalIds
 * @param {number} [gap]
 */
export function pullRelatedExternals(positions, relatedLocalByExt, localIds, externalIds, gap = 160) {
  const core = localCluster(positions, localIds);
  if (!core) return;

  for (const id of externalIds) {
    const p = positions.get(id);
    if (!p) continue;
    const rel = relatedLocalByExt.get(id) || [];
    if (!rel.length) continue;

    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const lid of rel) {
      const lp = positions.get(lid);
      if (!lp) continue;
      sx += lp.x;
      sy += lp.y;
      n++;
    }
    if (!n) continue;
    sx /= n;
    sy /= n;

    let dx = sx - core.x;
    let dy = sy - core.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 1e-3) {
      dx = p.x - core.x;
      dy = p.y - core.y;
      dist = Math.hypot(dx, dy) || 1;
    }
    const ux = dx / dist;
    const uy = dy / dist;
    const need = core.outer + gap + (p.size || 30) / 2;

    const cur = Math.hypot(p.x - core.x, p.y - core.y);
    const r = Math.max(need, Math.min(cur, need + 40));
    p.x = core.x + ux * r;
    p.y = core.y + uy * r;
  }
}

/**
 * 各外部分区钉回预定扇区角，只调半径、不改角度。
 * 防止多个外部分区因共同关联同一本类点而被吸到一起。
 * @param {Map<string, { x: number, y: number, size?: number }>} positions
 * @param {Iterable<{ ids: string[], angle: number }>} groups
 * @param {string[]} localIds
 * @param {number} [gap]
 */
export function snapExternalsToSectors(positions, groups, localIds, gap = 160) {
  const core = localCluster(positions, localIds);
  if (!core) return;

  for (const g of groups) {
    const ids = g.ids || [];
    if (!ids.length) continue;
    const angle = g.angle;

    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const id of ids) {
      const p = positions.get(id);
      if (!p) continue;
      cx += p.x;
      cy += p.y;
      n++;
    }
    if (!n) continue;
    cx /= n;
    cy /= n;

    let clusterOuter = 0;
    for (const id of ids) {
      const p = positions.get(id);
      if (!p) continue;
      clusterOuter = Math.max(
        clusterOuter,
        Math.hypot(p.x - cx, p.y - cy) + (p.size || 30) / 2,
      );
    }

    // 固定到目标半径（过远会拉回），不再 Math.max(curR) 把分区越推越远
    const R = core.outer + gap + clusterOuter;

    const nx = core.x + Math.cos(angle) * R;
    const ny = core.y + Math.sin(angle) * R;
    const dx = nx - cx;
    const dy = ny - cy;
    for (const id of ids) {
      const p = positions.get(id);
      if (!p) continue;
      p.x += dx;
      p.y += dy;
    }
  }
}

/**
 * @param {Map<string, { x: number, y: number, size?: number }>} positions
 * @param {string[]} localIds
 */
function localCluster(positions, localIds) {
  let lx = 0;
  let ly = 0;
  let ln = 0;
  let localOuter = 0;
  for (const id of localIds) {
    const p = positions.get(id);
    if (!p) continue;
    lx += p.x;
    ly += p.y;
    ln++;
  }
  if (!ln) return null;
  lx /= ln;
  ly /= ln;
  for (const id of localIds) {
    const p = positions.get(id);
    if (!p) continue;
    localOuter = Math.max(localOuter, Math.hypot(p.x - lx, p.y - ly) + (p.size || 30) / 2);
  }
  return { x: lx, y: ly, outer: localOuter };
}
