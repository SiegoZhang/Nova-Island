// 点阵效果共用的数学/噪声/取色原语。原来在 FlowNoiseDots.tsx（perlin2 /
// hash / hexToRgb / 内联 smoothstep）与 EarthStipple.tsx（私有重复的
// hash / hexToRgb）里各写一份，现在只保留这一份。

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 中心在 center、宽度为 sigma 的钟形曲线，取值 0~1。 */
export function gaussian(x: number, center: number, sigma: number): number {
  const d = (x - center) / sigma;
  return Math.exp(-d * d);
}

/** 三次平滑阶跃 t*t*(3-2*t)——原来在 FlowNoiseDots/EarthStipple/
 * HeroFlowBgTexture/HeroDotTexture 里各手写一份内联版本。 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 与帧率无关的指数缓动系数：dtMs 越大，本帧应该追近目标的比例越高。 */
export function easeFactor(halfLifeMs: number, dtMs: number): number {
  return 1 - Math.pow(0.5, dtMs / halfLifeMs);
}

export interface Point {
  x: number;
  y: number;
}

export function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const it = 1 - t;
  return {
    x: it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x,
    y: it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y,
  };
}

/** 点到线段 (ax,ay)-(bx,by) 的最短距离。 */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1) : 0;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

/** 逐格伪随机数（0~1）——地球/疏密点阵网格采样、噪声抖动的种子来源。 */
export function hash(gx: number, gy: number): number {
  const v = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// 经典 2D Perlin 噪声（置换表 + 梯度点积），自包含不依赖第三方库。固定种子
// 1337，保证每次加载生成的置换表一致，效果可复现。
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
})();

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hashValue: number, x: number, y: number) {
  const h = hashValue & 7;
  const gx = h < 4 ? 1 : -1;
  const gy = h % 4 < 2 ? 1 : -1;
  return gx * x + gy * y;
}

export function perlin2(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[xi] + yi];
  const ab = PERM[PERM[xi] + yi + 1];
  const ba = PERM[PERM[xi + 1] + yi];
  const bb = PERM[PERM[xi + 1] + yi + 1];
  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}
