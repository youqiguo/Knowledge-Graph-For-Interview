/**
 * 力导向布局（参考 Obsidian Graph / d3-force）：
 * - 节点大小 ∝ 关联度
 * - 斥力 + 边弹簧 + 弱向心
 * - 硬碰撞：保证圆心距 ≥ r1+r2+minGap
 * - 可选种子坐标 / 钉住节点 / 向种子锚点拉力（用于类别详情的分区初值）
 */

/**
 * @typedef {{ id: string, size: number, x?: number, y?: number }} LayoutNode
 * @typedef {{ source: string, target: string, weight?: number }} LayoutEdge
 */

/**
 * @param {LayoutNode[]} nodes
 * @param {LayoutEdge[]} edges
 * @param {{
 *   minGap?: number,
 *   iterations?: number,
 *   idealEdge?: number,
 *   charge?: number,
 *   gravity?: number,
 *   anchorStrength?: number,
 *   pinIds?: Iterable<string>,
 * }} [opts]
 * @returns {Map<string, { x: number, y: number, size: number }>}
 */
export function layoutForce(nodes, edges, opts = {}) {
  const minGap = opts.minGap ?? 112;
  const iterations = opts.iterations ?? 320;
  const idealEdge = opts.idealEdge ?? 220;
  const charge = opts.charge ?? 9000;
  const gravity = opts.gravity ?? 0.035;
  const anchorStrength = opts.anchorStrength ?? 0;
  const pinIds = new Set(opts.pinIds || []);

  const n = nodes.length;
  if (!n) return new Map();

  /** @type {Map<string, { id: string, size: number, r: number, x: number, y: number, vx: number, vy: number, ax: number, ay: number, pinned: boolean }>} */
  const bodies = new Map();

  const baseR = Math.max(180, 70 * Math.sqrt(n));
  nodes.forEach((node, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (i % 3) * 0.11;
    const jitter = 0.85 + (i % 5) * 0.06;
    const r = Math.max(10, node.size / 2);
    const hasSeed = typeof node.x === 'number' && typeof node.y === 'number';
    const x = hasSeed ? node.x : Math.cos(a) * baseR * jitter;
    const y = hasSeed ? node.y : Math.sin(a) * baseR * jitter;
    bodies.set(node.id, {
      id: node.id,
      size: node.size,
      r,
      x,
      y,
      vx: 0,
      vy: 0,
      ax: x,
      ay: y,
      pinned: pinIds.has(node.id),
    });
  });

  const adj = edges
    .map((e) => ({
      a: bodies.get(e.source),
      b: bodies.get(e.target),
      w: Math.max(1, e.weight || 1),
    }))
    .filter((e) => e.a && e.b);

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    const cool = 0.85 * alpha + 0.15;
    const list = [...bodies.values()];

    // 斥力
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1e-4) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const f = (charge * cool) / dist2;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        if (!A.pinned) {
          A.vx -= fx;
          A.vy -= fy;
        }
        if (!B.pinned) {
          B.vx += fx;
          B.vy += fy;
        }
      }
    }

    // 边弹簧（weight 越大拉得越紧，跨簇关联用更高 weight）
    for (const e of adj) {
      const { a: A, b: B, w } = e;
      let dx = B.x - A.x;
      let dy = B.y - A.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      // weight 大：弹簧更硬，且目标边略短（同组虚边/跨簇关联更紧）
      const wBoost = Math.min(4, Math.max(1, w));
      const target = Math.max(
        A.r + B.r + minGap * 0.35,
        idealEdge + (A.r + B.r) * 0.1 - Math.min(36, (wBoost - 1) * 10),
      );
      const k = 0.13 * cool * (0.7 + wBoost * 0.4);
      const f = (dist - target) * k;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      if (!A.pinned) {
        A.vx += fx;
        A.vy += fy;
      }
      if (!B.pinned) {
        B.vx -= fx;
        B.vy -= fy;
      }
    }

    // 弱向心 + 可选锚点拉力（保持分区大致方向）
    for (const b of list) {
      if (b.pinned) continue;
      b.vx -= b.x * gravity * cool;
      b.vy -= b.y * gravity * cool;
      if (anchorStrength > 0) {
        b.vx += (b.ax - b.x) * anchorStrength * cool;
        b.vy += (b.ay - b.y) * anchorStrength * cool;
      }
    }

    const maxStep = 28 * cool + 4;
    for (const b of list) {
      if (b.pinned) {
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const scale = Math.min(1, maxStep / sp);
      b.x += b.vx * scale;
      b.y += b.vy * scale;
      b.vx *= 0.6;
      b.vy *= 0.6;
    }

    const collIters = iter > iterations * 0.55 ? 4 : 2;
    for (let c = 0; c < collIters; c++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const A = list[i];
          const B = list[j];
          let dx = B.x - A.x;
          let dy = B.y - A.y;
          let dist = Math.hypot(dx, dy);
          const minDist = A.r + B.r + minGap;
          if (dist < 1e-6) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const ux = dx / dist;
            const uy = dy / dist;
            if (A.pinned && !B.pinned) {
              B.x += ux * push * 2;
              B.y += uy * push * 2;
            } else if (B.pinned && !A.pinned) {
              A.x -= ux * push * 2;
              A.y -= uy * push * 2;
            } else if (!A.pinned && !B.pinned) {
              A.x -= ux * push;
              A.y -= uy * push;
              B.x += ux * push;
              B.y += uy * push;
            }
          }
        }
      }
    }
  }

  const list = [...bodies.values()];
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        let dist = Math.hypot(dx, dy);
        const minDist = A.r + B.r + minGap;
        if (dist < 1e-6) {
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          dist = 1;
        }
        if (dist < minDist) {
          const push = (minDist - dist) / 2 + 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          if (A.pinned && !B.pinned) {
            B.x += ux * push * 2;
            B.y += uy * push * 2;
            moved = true;
          } else if (B.pinned && !A.pinned) {
            A.x -= ux * push * 2;
            A.y -= uy * push * 2;
            moved = true;
          } else if (!A.pinned && !B.pinned) {
            A.x -= ux * push;
            A.y -= uy * push;
            B.x += ux * push;
            B.y += uy * push;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }

  /** @type {Map<string, { x: number, y: number, size: number }>} */
  const out = new Map();
  for (const b of bodies.values()) {
    out.set(b.id, { x: b.x, y: b.y, size: b.size });
  }
  return out;
}

/** @deprecated 使用 layoutForce；保留别名兼容 */
export const layoutCategoryForce = layoutForce;

/**
 * 按关联度计算类别球大小
 * @param {number} linkDegree
 * @param {number} detailCount
 */
export function categoryNodeSize(linkDegree, detailCount) {
  const base = 28;
  const byLink = Math.min(34, linkDegree * 5);
  const byKids = Math.min(14, Math.sqrt(Math.max(0, detailCount)) * 3.2);
  return Math.round(base + byLink + byKids);
}

/**
 * 详细知识点球大小（连接越多越大）
 * @param {number} degree
 */
export function detailNodeSize(degree) {
  return Math.round(26 + Math.min(34, Math.max(0, degree) * 5));
}

/**
 * 硬分离：反复推开直到圆心距 ≥ r1+r2+minGap（或达到迭代上限）
 * @param {Map<string, { x: number, y: number, size?: number }>} positions
 * @param {number} [minGap]
 * @param {number} [passes]
 */
export function hardSeparate(positions, minGap = 112, passes = 40) {
  const list = [...positions.entries()].map(([id, p]) => ({
    id,
    p,
    r: Math.max(10, (p.size || 30) / 2),
  }));
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        let dx = B.p.x - A.p.x;
        let dy = B.p.y - A.p.y;
        let dist = Math.hypot(dx, dy);
        const need = A.r + B.r + minGap;
        if (dist < 1e-6) {
          const a = (i * 17 + j * 13) * 0.21;
          dx = Math.cos(a);
          dy = Math.sin(a);
          dist = 1;
        }
        if (dist < need) {
          const push = (need - dist) / 2 + 0.75;
          const ux = dx / dist;
          const uy = dy / dist;
          A.p.x -= ux * push;
          A.p.y -= uy * push;
          B.p.x += ux * push;
          B.p.y += uy * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return positions;
}

/**
 * 环形种子半径：保证弧长足以放下 size+gap
 * @param {number[]} sizes
 * @param {number} minGap
 */
export function ringRadiusForSizes(sizes, minGap = 112) {
  const n = Math.max(sizes.length, 1);
  let arc = 0;
  for (const s of sizes) arc += Math.max(24, s) + minGap;
  return Math.max(160, arc / (2 * Math.PI));
}
