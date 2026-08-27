"use client";

import { useEffect, useRef } from "react";

import { clamp, lerp, perlin2, smoothstep } from "@/lib/dotSystem/math";
import {
  createVisibilityLifecycle,
  getClampedDpr,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

// 「点阵地球 + 水波」——跟 Hero 的「日出视频」（VideoDotMatrix：把一段视频
// 逐帧采样成亮度网格再着色）是**两套完全无关的实现**，一行代码都不共用：
//
// 这里没有视频源，水波是**在球面上算出来的**：
//   1. 把容器里的圆当成一颗球，每个格子反投影出它在球面上的经纬度
//      (lon/lat) 和正对程度 facing（球心处 1、边缘 0）。
//   2. 球面上放几个「波源」，每个波源发出一圈圈随时间向外扩张的正弦波
//      （sin(大圆距离 × 频率 − 时间 × 速度)），随距离衰减。几个波源的
//      波前互相干涉，就叠出参照帧里那种一团团流动、时聚时散的蓝色鳞光。
//   3. 再叠一层低频 perlin 让整体缓慢起伏、不呆板。
//   波是定义在经纬度上的，所以它「贴着球面」跑——靠近边缘会自然被压扁
//      （foreshortening），看起来是绕着地球转，而不是一张平面贴图在滑动。
//   4. 最后用 earth.png 本身的明暗调制：波峰扫过海洋偏蓝、扫过大陆/云层
//      提亮到发白，隐约能看出地球的样子。
//
// Canvas 2D 逐帧重画（格子数 ~1e4，每帧几个 sin + 一个 perlin，JS 跑
// 60fps 没问题）。视口外 / 切后台自动停 rAF。

export interface RippleColorStop {
  stop: number;
  hex: string;
}

export interface EarthRippleDotMatrixProps {
  src?: string;
  className?: string;
  /** 网格间距（css px），越小越密 */
  cellPx?: number;
  /** 最亮处点直径（css px） */
  maxRadiusPx?: number;
  /** 峰值不透明度上限（0~1） */
  maxAlpha?: number;
  /** 水波流动速度倍率，1 = 基准，0 = 静止 */
  rippleSpeed?: number;
  /** 水波强度：0 = 几乎全黑只剩地球轮廓，1 = 波峰亮到发白 */
  rippleIntensity?: number;
  /** 亮度→颜色的多段色阶 */
  colorStops?: RippleColorStop[];
}

interface Cell {
  x: number;
  y: number;
  /** 球面经度 (rad)，反投影得到 */
  lon: number;
  /** 球面纬度 (rad) */
  lat: number;
  /** 正对程度：球心 1 → 边缘 0（= 视线方向的 z 分量） */
  facing: number;
  /** earth.png 在该格的亮度 0~1 */
  baseLum: number;
  /** 落在球体轮廓内的比例（透明背景处 0，完全不画） */
  alphaFrac: number;
}

// 白底配色：浅（淡蓝灰，几乎融进白底）→ 中（宝蓝）→ 深（近黑靛蓝）。
// 值越大点越大、越深——地球本身的明暗打底，水波峰扫过时进一步压深。
const DEFAULT_COLOR_STOPS: RippleColorStop[] = [
  { stop: 0.0, hex: "#c9d6ef" },
  { stop: 0.35, hex: "#7f9fdd" },
  { stop: 0.62, hex: "#3f63c4" },
  { stop: 0.82, hex: "#20337d" },
  { stop: 1.0, hex: "#0b1533" },
];

// 球面上的波源（经度/纬度，rad）。每个波源自己的空间频率 k（一圈圈的密
// 度）、时间角速度 omega（往外扩多快）、随距离的衰减 decay、初相 phase。
// 取了几个彼此错开的值，让波前永远不会整齐地同心叠合。
const WAVE_SOURCES = [
  { lon: -0.9, lat: 0.4, k: 6.0, omega: 1.4, decay: 0.55, phase: 0.0, amp: 1.0 },
  { lon: 0.7, lat: 0.1, k: 5.2, omega: 1.1, decay: 0.5, phase: 1.9, amp: 1.0 },
  { lon: 1.8, lat: 0.6, k: 6.8, omega: 1.65, decay: 0.6, phase: 3.4, amp: 0.95 },
  { lon: -2.0, lat: 0.0, k: 5.6, omega: 1.3, decay: 0.5, phase: 5.0, amp: 0.95 },
  { lon: 0.2, lat: 0.85, k: 7.2, omega: 1.85, decay: 0.65, phase: 2.3, amp: 0.85 },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function buildRamp(stops: RippleColorStop[]): (t: number) => [number, number, number] {
  const parsed = stops
    .map((s) => ({ stop: clamp(s.stop, 0, 1), rgb: hexToRgb(s.hex) }))
    .sort((a, b) => a.stop - b.stop);
  return (t: number) => {
    const c = clamp(t, 0, 1);
    for (let i = 0; i < parsed.length - 1; i++) {
      const a = parsed[i];
      const b = parsed[i + 1];
      if (c >= a.stop && c <= b.stop) {
        const lt = (c - a.stop) / (b.stop - a.stop || 1);
        return [
          lerp(a.rgb[0], b.rgb[0], lt),
          lerp(a.rgb[1], b.rgb[1], lt),
          lerp(a.rgb[2], b.rgb[2], lt),
        ];
      }
    }
    return parsed[parsed.length - 1].rgb;
  };
}

export function EarthRippleDotMatrix({
  src = "/images/earth.png",
  className,
  cellPx = 11,
  maxRadiusPx = 4.4,
  maxAlpha = 0.95,
  rippleSpeed = 1,
  rippleIntensity = 1,
  colorStops = DEFAULT_COLOR_STOPS,
}: EarthRippleDotMatrixProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const recomputeRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      recomputeRef.current();
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ramp = buildRamp(colorStops);
    const reduceMotion = prefersReducedMotion();

    let cells: Cell[] = [];
    let width = 0;
    let height = 0;

    function computeCells() {
      const img = imageRef.current;
      if (!img || !container || !canvas || !ctx) return;
      width = container.clientWidth;
      height = container.clientHeight;
      if (width <= 0 || height <= 0) return;

      const dpr = getClampedDpr();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.max(1, Math.round(width / cellPx));
      const rows = Math.max(1, Math.round(height / cellPx));

      // object-fit: contain 换算——整张贴图等比缩放居中塞进采样网格。
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih) return;
      const containerAspect = width / height;
      const imageAspect = iw / ih;
      let dx = 0;
      let dy = 0;
      let dw = cols;
      let dh = rows;
      if (imageAspect > containerAspect) {
        dh = cols / imageAspect;
        dy = (rows - dh) / 2;
      } else {
        dw = rows * imageAspect;
        dx = (cols - dw) / 2;
      }

      const sample = document.createElement("canvas");
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext("2d", { willReadFrequently: true });
      if (!sctx) return;
      sctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
      const { data } = sctx.getImageData(0, 0, cols, rows);

      const cellCssW = width / cols;
      const cellCssH = height / rows;

      // 球在采样网格里的圆心/半径：contain 之后贴图铺满的那块区域的内切圆。
      const discCx = dx + dw / 2;
      const discCy = dy + dh / 2;
      const discR = Math.min(dw, dh) / 2;

      const next: Cell[] = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = (row * cols + col) * 4;
          const alphaFrac = data[idx + 3] / 255;
          if (alphaFrac <= 0.02) continue;
          const baseLum =
            (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;

          // 反投影：格子中心 → 球面单位向量 → 经纬度
          const sx = (col + 0.5 - discCx) / discR; // -1..1
          const syScreen = (row + 0.5 - discCy) / discR;
          const r2 = sx * sx + syScreen * syScreen;
          const sz = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));
          const sy = -syScreen; // 屏幕 y 向下 → 纬度向上为正
          const lat = Math.asin(clamp(sy, -1, 1));
          const lon = Math.atan2(sx, sz);

          next.push({
            x: (col + 0.5) * cellCssW,
            y: (row + 0.5) * cellCssH,
            lon,
            lat,
            facing: sz,
            baseLum,
            alphaFrac,
          });
        }
      }
      cells = next;
    }

    // 给定球面点 (lon,lat) 和某波源，返回该点这一帧的波高贡献。
    function waveAt(
      lon: number,
      lat: number,
      cosLat: number,
      sinLat: number,
      s: (typeof WAVE_SOURCES)[number],
      t: number,
    ): number {
      // 到波源的大圆角距离
      const cosD =
        sinLat * Math.sin(s.lat) + cosLat * Math.cos(s.lat) * Math.cos(lon - s.lon);
      const gd = Math.acos(clamp(cosD, -1, 1));
      const falloff = Math.exp(-gd * s.decay);
      return s.amp * Math.sin(gd * s.k - t * s.omega + s.phase) * falloff;
    }

    function render(timeSec: number) {
      if (!ctx || width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);

      const t = timeSec * rippleSpeed;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const cosLat = Math.cos(cell.lat);
        const sinLat = Math.sin(cell.lat);

        // 几个波源干涉 → 波高 field ∈ 约 [-2, 2]
        let field = 0;
        for (let w = 0; w < WAVE_SOURCES.length; w++) {
          field += waveAt(cell.lon, cell.lat, cosLat, sinLat, WAVE_SOURCES[w], t);
        }
        // 低频 perlin 让整体缓慢起伏（也在经纬度空间里，跟着球转）
        const swell =
          perlin2(cell.lon * 0.9 + t * 0.06, cell.lat * 1.4 - t * 0.03) * 1.0;
        field = field / WAVE_SOURCES.length + swell * 0.35;

        // 波峰 → 一道流动的水纹在球面上跑。0~1，波谷落到 0。
        let crest = smoothstep(-0.3, 0.4, field);
        // 贴球面：越靠边缘越弱（正对程度），最外圈再收一下
        crest *= 0.45 + 0.55 * cell.facing;
        crest *= smoothstep(0.015, 0.14, cell.facing);

        // 白底合成：地球本身的点阵打底（永远在，海洋也给一个下限，整个下半
        // 球都铺满蓝点），水波峰扫过时在这个基础上进一步压深、放大——像水面
        // 反光的一道波纹在地球表面移动。
        const base =
          (0.22 + 0.78 * Math.pow(cell.baseLum, 1.15)) * (0.5 + 0.5 * cell.facing);
        const v = clamp(base * 0.78 + crest * rippleIntensity * 0.5, 0, 1);
        if (v < 0.04) continue;

        const size = maxRadiusPx * (0.12 + 0.88 * v);
        if (size < 0.2) continue;

        const [cr, cg, cbl] = ramp(v);
        const alpha = cell.alphaFrac * smoothstep(0.02, 0.3, v) * maxAlpha;
        if (alpha < 0.02) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${cr | 0}, ${cg | 0}, ${cbl | 0})`;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    let rafId = 0;
    let running = false;
    let startTs = 0;

    function frame(ts: number) {
      if (!startTs) startTs = ts;
      render((ts - startTs) / 1000);
      if (running) rafId = requestAnimationFrame(frame);
    }
    function start() {
      if (running) return;
      running = true;
      startTs = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function recompute() {
      computeCells();
      if (reduceMotion) render(0);
    }

    recomputeRef.current = recompute;
    recompute();

    const resizeObserver = new ResizeObserver(() => {
      computeCells();
      if (reduceMotion) render(0);
    });
    resizeObserver.observe(container);

    let disposeVisibility: (() => void) | undefined;
    if (!reduceMotion) {
      disposeVisibility = createVisibilityLifecycle(container, {
        onVisible: start,
        onHidden: stop,
      });
    }

    return () => {
      stop();
      resizeObserver.disconnect();
      disposeVisibility?.();
      recomputeRef.current = () => {};
    };
  }, [cellPx, maxRadiusPx, maxAlpha, rippleSpeed, rippleIntensity, colorStops]);

  return (
    <div ref={containerRef} aria-hidden="true" className={`size-full ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
