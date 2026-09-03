"use client";

import { useEffect, useRef, useState } from "react";

import {
  CommitColorPicker,
  TuningPanelShell,
  TuningSlider,
} from "@/components/dotSystemTuningControls";
import {
  createVisibilityLifecycle,
  getClampedDpr,
  manageVideoElement,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

// ── 视频 → 轮廓线 ─────────────────────────────────────────────────
// 用**等高线**勾勒人像：每帧对视频做亮度采样 + 轻度模糊，在若干个亮度层级
// 上跑 marching squares，得到一圈圈顺形体缠绕的平滑曲线——线随人像转动而
// 流动，不闪烁（帧间对亮度场做时间插值消抖动）。
//
// · 背景默认透明（只画线），maskThreshold 把人像四周弱辉光/噪点也抠掉。
// · 采样 contain（不裁切左右），等高线映射到画布居中的正方形。
// · glass（默认开）：线下垫一层顺人形的半透明填充（长春花紫渐变 + 左上柔光），
//   线条带辉光 + 冷暖过渡，像一块磨砂水晶，对齐 Hero 水晶球。
//
// 视觉参数全部走 paramsRef 就地重绘，不重建、不重载视频；开发环境右下角有
// ⚙ 调参面板（跟点阵那几个组件同一套外壳），「复制当前数值」按钮把 JSON
// 拷到剪贴板，粘进 <VideoContourLines> 的 props 即定稿。
//
// 实现：Canvas 2D。采样网格 GRID²，每层一条 path 一次 stroke。

// 玻璃模式会把采样结果直接放大成人像，低分辨率网格会产生明显的糊边。
// 288 在桌面端仍能稳定跑 30fps，同时轮廓精度比原来的 168 提升约 70%。
const GRID = 288;

function parseHexColor(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return [255, 255, 255];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

interface Tuning {
  showContours: boolean;
  levels: number;
  lowClip: number;
  highClip: number;
  maskThreshold: number;
  lineWidth: number;
  blurPasses: number;
  contrast: number;
  temporalEase: number;
  glass: boolean;
  fillOpacity: number;
  glow: number;
  tintLight: string;
  tintDeep: string;
}

export interface VideoContourLinesProps {
  className?: string;
  src?: string;
  /** 等高线层数，默认 13。 */
  levels?: number;
  /** 最低 / 最高取线的亮度（跳过纯黑背景与死白高光）。默认 0.1 / 0.94。 */
  lowClip?: number;
  highClip?: number;
  /** 线宽（px）。默认 1。 */
  lineWidth?: number;
  /** 亮度场模糊次数。默认 2。 */
  blurPasses?: number;
  /** 亮度对比。默认 1.25。 */
  contrast?: number;
  /** 帧间平滑 0~1。默认 0.35。 */
  temporalEase?: number;
  color?: string;
  /** 背景色，仅在 transparentBackground=false 时用。默认黑。 */
  background?: string;
  /** 透明背景，默认 true。 */
  transparentBackground?: boolean;
  /** 人形遮罩阈值，默认 lowClip * 0.9。 */
  maskThreshold?: number;
  /** 半透明玻璃感，默认 true。 */
  glass?: boolean;
  /** 玻璃填充最大不透明度。默认 0.16。 */
  fillOpacity?: number;
  /** 玻璃亮部色（顶左）。默认 Hero 长春花紫。 */
  tintLight?: string;
  /** 玻璃暗部色（底右）。默认 Hero 中紫。 */
  tintDeep?: string;
  /** 线条辉光半径（px）。默认 2。 */
  glow?: number;
  /** 是否绘制等高线。关闭后只保留由视频驱动的玻璃体积。默认 true。 */
  showContours?: boolean;
  speed?: number;
  /** 隐藏开发环境的 ⚙ 调参面板（默认在非生产环境显示）。 */
  hideTuner?: boolean;
}

export function VideoContourLines({
  className,
  src = "/videos/navigator.mp4",
  levels = 13,
  lowClip = 0.1,
  highClip = 0.94,
  lineWidth = 1,
  blurPasses = 2,
  contrast = 1.25,
  temporalEase = 0.35,
  color = "#ffffff",
  background = "#000000",
  transparentBackground = true,
  maskThreshold,
  glass = true,
  fillOpacity = 0.16,
  tintLight = "#ccb3eb",
  tintDeep = "#8c57c7",
  glow = 2,
  showContours = true,
  speed = 1,
  hideTuner = false,
}: VideoContourLinesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [tuning, setTuning] = useState<Tuning>({
    showContours,
    levels,
    lowClip,
    highClip,
    maskThreshold: maskThreshold ?? lowClip * 0.9,
    lineWidth,
    blurPasses,
    contrast,
    temporalEase,
    glass,
    fillOpacity,
    glow,
    tintLight,
    tintDeep,
  });
  const set = <K extends keyof Tuning>(k: K, v: Tuning[K]) =>
    setTuning((t) => ({ ...t, [k]: v }));

  const paramsRef = useRef(tuning);
  const redrawRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    paramsRef.current = tuning;
    redrawRef.current?.();
  }, [tuning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduce = prefersReducedMotion();

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = GRID;
    sampleCanvas.height = GRID;
    const sctx = sampleCanvas.getContext("2d", { willReadFrequently: true });

    const fillCanvas = document.createElement("canvas");
    fillCanvas.width = GRID;
    fillCanvas.height = GRID;
    const fctx = fillCanvas.getContext("2d");
    const fillPixels = new Uint8ClampedArray(GRID * GRID * 4);
    const fillImage = new ImageData(fillPixels, GRID, GRID);

    const video = document.createElement("video");
    video.playbackRate = Math.min(4, Math.max(0.1, speed));

    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let videoReady = false;

    const field = new Float32Array(GRID * GRID);
    const rawArr = new Float32Array(GRID * GRID);
    const pong = new Float32Array(GRID * GRID);
    const hScratch = new Float32Array(GRID * GRID);

    function resize() {
      cssW = container!.clientWidth;
      cssH = container!.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      dpr = Math.min(2, getClampedDpr());
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    function boxBlur(srcArr: Float32Array, dstArr: Float32Array) {
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const x0 = x > 0 ? x - 1 : 0;
          const x1 = x < GRID - 1 ? x + 1 : GRID - 1;
          hScratch[y * GRID + x] =
            (srcArr[y * GRID + x0] + srcArr[y * GRID + x] + srcArr[y * GRID + x1]) / 3;
        }
      }
      for (let y = 0; y < GRID; y++) {
        const y0 = y > 0 ? y - 1 : 0;
        const y1 = y < GRID - 1 ? y + 1 : GRID - 1;
        for (let x = 0; x < GRID; x++) {
          dstArr[y * GRID + x] =
            (hScratch[y0 * GRID + x] + hScratch[y * GRID + x] + hScratch[y1 * GRID + x]) / 3;
        }
      }
    }

    function readVideo() {
      if (!sctx) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const p = paramsRef.current;
      // contain：整帧完整放进方形采样网格，四周留黑——左右不裁切人形
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, GRID, GRID);
      const vAsp = vw / vh;
      let dw = GRID;
      let dh = GRID;
      let dx = 0;
      let dy = 0;
      if (vAsp >= 1) {
        dh = GRID / vAsp;
        dy = (GRID - dh) / 2;
      } else {
        dw = GRID * vAsp;
        dx = (GRID - dw) / 2;
      }
      sctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
      const data = sctx.getImageData(0, 0, GRID, GRID).data;
      for (let i = 0; i < GRID * GRID; i++) {
        let v = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
        v = Math.min(1, Math.max(0, (v - 0.5) * p.contrast + 0.5));
        rawArr[i] = v;
      }
      let cur = rawArr;
      const passes = Math.max(0, Math.round(p.blurPasses));
      for (let q = 0; q < passes; q++) {
        const dst = cur === rawArr ? pong : rawArr;
        boxBlur(cur, dst);
        cur = dst;
      }
      const e = videoReady ? Math.min(1, Math.max(0.05, p.temporalEase)) : 1;
      for (let i = 0; i < GRID * GRID; i++) field[i] += (cur[i] - field[i]) * e;
    }

    const frac = (a: number, b: number, L: number) => {
      const t = (L - a) / (b - a);
      return t < 0 ? 0 : t > 1 ? 1 : t;
    };

    function layoutSquare() {
      const side = Math.min(canvas.width, canvas.height);
      return { side, ox: (canvas.width - side) / 2, oy: (canvas.height - side) / 2 };
    }

    function traceLevel(L: number, maskV: number) {
      const { side, ox, oy } = layoutSquare();
      const g = side / (GRID - 1);
      for (let y = 0; y < GRID - 1; y++) {
        for (let x = 0; x < GRID - 1; x++) {
          const tl = field[y * GRID + x];
          const tr = field[y * GRID + x + 1];
          const br = field[(y + 1) * GRID + x + 1];
          const bl = field[(y + 1) * GRID + x];
          let ci = 0;
          if (tl > L) ci |= 8;
          if (tr > L) ci |= 4;
          if (br > L) ci |= 2;
          if (bl > L) ci |= 1;
          if (ci === 0 || ci === 15) continue;
          if (tl < maskV && tr < maskV && br < maskV && bl < maskV) continue;

          const top = (x + frac(tl, tr, L)) * g + ox;
          const topY = y * g + oy;
          const rgt = (x + 1) * g + ox;
          const rgtY = (y + frac(tr, br, L)) * g + oy;
          const bot = (x + frac(bl, br, L)) * g + ox;
          const botY = (y + 1) * g + oy;
          const lft = x * g + ox;
          const lftY = (y + frac(tl, bl, L)) * g + oy;

          switch (ci) {
            case 1:
            case 14:
              ctx!.moveTo(lft, lftY);
              ctx!.lineTo(bot, botY);
              break;
            case 2:
            case 13:
              ctx!.moveTo(bot, botY);
              ctx!.lineTo(rgt, rgtY);
              break;
            case 3:
            case 12:
              ctx!.moveTo(lft, lftY);
              ctx!.lineTo(rgt, rgtY);
              break;
            case 4:
            case 11:
              ctx!.moveTo(top, topY);
              ctx!.lineTo(rgt, rgtY);
              break;
            case 5:
              ctx!.moveTo(lft, lftY);
              ctx!.lineTo(top, topY);
              ctx!.moveTo(bot, botY);
              ctx!.lineTo(rgt, rgtY);
              break;
            case 6:
            case 9:
              ctx!.moveTo(top, topY);
              ctx!.lineTo(bot, botY);
              break;
            case 7:
            case 8:
              ctx!.moveTo(lft, lftY);
              ctx!.lineTo(top, topY);
              break;
            case 10:
              ctx!.moveTo(top, topY);
              ctx!.lineTo(rgt, rgtY);
              ctx!.moveTo(lft, lftY);
              ctx!.lineTo(bot, botY);
              break;
          }
        }
      }
    }

    function drawGlass(p: Tuning) {
      if (!fctx) return;
      const fillT = Math.max(p.maskThreshold, p.lowClip);
      const light = parseHexColor(p.tintLight);
      const deep = parseHexColor(p.tintDeep);
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const i = y * GRID + x;
          const v = field[i];
          const maskRaw = Math.min(1, Math.max(0, (v - fillT) / 0.16));
          const mask = maskRaw * maskRaw * (3 - 2 * maskRaw);

          // 亮度梯度近似玻璃表面法线：轮廓与视频中的明暗转折会出现折射亮边，
          // 内部则保持清透，不再是一块同色、同透明度的实心蒙版。
          const left = field[y * GRID + Math.max(0, x - 1)];
          const right = field[y * GRID + Math.min(GRID - 1, x + 1)];
          const top = field[Math.max(0, y - 1) * GRID + x];
          const bottom = field[Math.min(GRID - 1, y + 1) * GRID + x];
          const nx = right - left;
          const ny = bottom - top;
          const rim = Math.min(1, Math.hypot(nx, ny) * 5.5);
          const fx = x / (GRID - 1);
          const fy = y / (GRID - 1);
          const diagonalSheen = Math.exp(-Math.pow((fx * 0.72 + fy * 0.28) - 0.31, 2) / 0.012);
          const glassLight = Math.min(1, v * 0.58 + rim * 0.72 + diagonalSheen * 0.2);
          const spectral = rim * 28;

          fillPixels[i * 4] = Math.round(deep[0] + (light[0] - deep[0]) * glassLight + spectral * Math.max(0, -nx));
          fillPixels[i * 4 + 1] = Math.round(deep[1] + (light[1] - deep[1]) * glassLight + spectral * Math.max(0, ny));
          fillPixels[i * 4 + 2] = Math.round(deep[2] + (light[2] - deep[2]) * glassLight + spectral * Math.max(0, nx));
          fillPixels[i * 4 + 3] = Math.round(mask * (0.24 + v * 0.4 + rim * 0.36) * 255);
        }
      }
      fctx.globalCompositeOperation = "source-over";
      fctx.putImageData(fillImage, 0, 0);

      const { side, ox, oy } = layoutSquare();
      ctx!.save();
      ctx!.imageSmoothingEnabled = true;
      // 一层很轻的紫色焦散，不扩大轮廓，只给高亮处一点空气感。
      ctx!.globalAlpha = p.fillOpacity * 0.22;
      ctx!.filter = `blur(${Math.max(1, p.glow) * dpr}px)`;
      ctx!.drawImage(fillCanvas, ox, oy, side, side);
      ctx!.filter = "none";
      ctx!.globalAlpha = p.fillOpacity;
      ctx!.drawImage(fillCanvas, ox, oy, side, side);
      ctx!.restore();
    }

    function draw() {
      if (cssW <= 0) return;
      const p = paramsRef.current;
      if (transparentBackground) {
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx!.fillStyle = background;
        ctx!.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (p.glass) drawGlass(p);

      if (p.showContours) {
        ctx!.lineWidth = p.lineWidth * dpr;
        ctx!.lineJoin = "round";
        ctx!.lineCap = "round";
        if (p.glass && p.glow > 0) {
          ctx!.shadowColor = p.tintLight;
          ctx!.shadowBlur = p.glow * dpr;
        }
        const sq = layoutSquare();
        let lineStyle: string | CanvasGradient = color;
        if (p.glass) {
          const lg = ctx!.createLinearGradient(0, sq.oy, 0, sq.oy + sq.side);
          lg.addColorStop(0, "rgba(244,241,255,0.95)");
          lg.addColorStop(1, "rgba(201,178,235,0.8)");
          lineStyle = lg;
        }

        const maskV = p.maskThreshold;
        const n = Math.max(3, Math.round(p.levels));
        for (let k = 0; k < n; k++) {
          const L = p.lowClip + ((p.highClip - p.lowClip) * (k + 0.5)) / n;
          const edge = Math.abs((k + 0.5) / n - 0.5) * 2;
          ctx!.globalAlpha = (p.glass ? 0.28 : 0.35) + 0.5 * (1 - edge * edge);
          ctx!.strokeStyle = lineStyle;
          ctx!.beginPath();
          traceLevel(L, maskV);
          ctx!.stroke();
        }
      }
      ctx!.shadowBlur = 0;
      ctx!.globalAlpha = 1;
    }

    redrawRef.current = () => {
      if (videoReady) readVideo();
      draw();
    };

    // ── 生命周期 ─────────────────────────────────────────────
    let raf = 0;
    let running = false;
    let last = 0;
    const FRAME_MS = 1000 / 30;

    const managed = manageVideoElement(video, {
      src,
      onReady: () => {
        videoReady = true;
        readVideo();
        draw();
        start();
      },
      onError: () => {
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
      },
    });

    function frame(now: number) {
      managed.tick();
      if (videoReady && now - last >= FRAME_MS) {
        last = now;
        readVideo();
        draw();
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      managed.play();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      managed.pause();
    }

    resize();
    draw();
    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(container);

    let disposeVisibility = () => {};
    if (reduce) {
      if (videoReady) {
        readVideo();
        draw();
      }
    } else {
      disposeVisibility = createVisibilityLifecycle(container, { onVisible: start, onHidden: stop });
    }

    return () => {
      redrawRef.current = null;
      stop();
      disposeVisibility();
      ro.disconnect();
      managed.dispose();
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [src, speed, color, background, transparentBackground]);

  const showTuner = !hideTuner && process.env.NODE_ENV !== "production";

  return (
    <div ref={containerRef} className={`relative size-full ${className ?? ""}`}>
      {showTuner && <ContourTuner tuning={tuning} set={set} />}
    </div>
  );
}

function ContourTuner({
  tuning,
  set,
}: {
  tuning: Tuning;
  set: <K extends keyof Tuning>(k: K, v: Tuning[K]) => void;
}) {
  return (
    <TuningPanelShell title="人形视频玻璃效果">
      <label className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-[#78716c]">等高线</span>
        <input
          type="checkbox"
          checked={tuning.showContours}
          onChange={(e) => set("showContours", e.target.checked)}
          className="accent-[#2f56d8]"
        />
      </label>
      <TuningSlider label="层数" value={tuning.levels} min={3} max={26} step={1} unit="" onChange={(v) => set("levels", v)} />
      <TuningSlider label="低亮" value={tuning.lowClip} min={0} max={0.6} step={0.01} unit="" onChange={(v) => set("lowClip", v)} />
      <TuningSlider label="高亮" value={tuning.highClip} min={0.5} max={1} step={0.01} unit="" onChange={(v) => set("highClip", v)} />
      <TuningSlider label="抠图" value={tuning.maskThreshold} min={0} max={0.5} step={0.01} unit="" onChange={(v) => set("maskThreshold", v)} />
      <TuningSlider label="线宽" value={tuning.lineWidth} min={0.5} max={3} step={0.1} unit="" onChange={(v) => set("lineWidth", v)} />
      <TuningSlider label="平滑" value={tuning.blurPasses} min={0} max={5} step={1} unit="" onChange={(v) => set("blurPasses", v)} />
      <TuningSlider label="对比" value={tuning.contrast} min={0.6} max={2.5} step={0.05} unit="" onChange={(v) => set("contrast", v)} />
      <TuningSlider label="跟手" value={tuning.temporalEase} min={0.05} max={1} step={0.05} unit="" onChange={(v) => set("temporalEase", v)} />
      <TuningSlider label="填充" value={tuning.fillOpacity} min={0} max={0.5} step={0.01} unit="" onChange={(v) => set("fillOpacity", v)} />
      <TuningSlider label="辉光" value={tuning.glow} min={0} max={6} step={0.5} unit="" onChange={(v) => set("glow", v)} />
      <label className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-[#78716c]">玻璃</span>
        <input
          type="checkbox"
          checked={tuning.glass}
          onChange={(e) => set("glass", e.target.checked)}
          className="accent-[#2f56d8]"
        />
      </label>
      <CommitColorPicker label="亮部" value={tuning.tintLight} onCommit={(v) => set("tintLight", v)} />
      <CommitColorPicker label="暗部" value={tuning.tintDeep} onCommit={(v) => set("tintDeep", v)} />
      <button
        type="button"
        onClick={() => {
          const json = JSON.stringify(tuning, null, 2);
          navigator.clipboard?.writeText(json).catch(() => {});
          console.log("[VideoContourLines]", json);
        }}
        className="mt-1 rounded-md border border-black/[0.1] px-2 py-1 text-[11px] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
      >
        复制当前数值
      </button>
    </TuningPanelShell>
  );
}
