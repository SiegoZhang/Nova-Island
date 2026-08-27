"use client";

import { useEffect, useRef } from "react";

import { createPointerHoverState, getClampedDpr, prefersReducedMotion } from "@/lib/dotSystem/runtime";
import { IMAGE_DOT_MATRIX_HOVER_DEFAULTS } from "@/lib/dotSystem/tokens";

// 静态图片版的点阵纹理——跟 VideoDotMatrix 用同一套"离屏采样格子求平均亮度"
// 手法（cover 裁切 + 缩小到 cols x rows 自带区域平均），但图片只需要采样
// 一次（没有逐帧播放），所以用普通 2D canvas 而不是 WebGL/Three.js，参数
// 一变就整张重画，不需要常驻 rAF 循环。只画一种固定颜色的点（不像
// VideoDotMatrix 那样按亮度在 colorLow/colorHigh 间渐变），点的半径按亮度
// 在 minRadiusPx~maxRadiusPx 之间插值，alpha 通道决定该点是否存在（抠图
// 透明背景的部分完全不画）。
//
// 半径故意用绝对 css px（而不是相对 cellPx 的比例）：跟 VideoDotMatrix 的
// dotMinSize/dotMaxSize 同一个约定——density（cellPx，格子有多密）和点径
// 是两个独立维度，改密度不应该顺带把点也跟着放大/缩小，调参面板里两个
// 滑块才不会互相干扰。

export interface ImageDotMatrixProps {
  /** 图片源（public 目录下的路径），建议用透明背景抠图，效果更干净 */
  src: string;
  className?: string;
  /** 网格间距（css px）——值越小格子越密，点阵越密集 */
  cellPx?: number;
  /** 暗部点直径（css px） */
  minRadiusPx?: number;
  /** 亮部点直径（css px） */
  maxRadiusPx?: number;
  /** 亮度→半径插值曲线的指数，>1 让暗部更快收缩、明暗对比更强 */
  gamma?: number;
  /** 峰值不透明度上限（0~1） */
  maxAlpha?: number;
  /** 点的颜色（hex） */
  color?: string;
  /**
   * 是否开启鼠标悬浮"聚拢"效果：鼠标靠近时，附近的点会被拉向鼠标位置并
   * 放大，形成一小片点阵向鼠标聚拢的观感；鼠标移开后再缓动回原位。默认
   * false，不影响原有的纯静态渲染。会在 window 上监听 pointermove 判断
   * 鼠标是否落在容器范围内，不依赖画布自身的 pointer-events。
   */
  mouseInteraction?: boolean;
  /** 悬浮影响半径（css px），默认见 IMAGE_DOT_MATRIX_HOVER_DEFAULTS.radiusPx */
  hoverRadiusPx?: number;
  /** 悬浮时点被拉向鼠标的位移比例（0~1），默认见 …HOVER_DEFAULTS.attract */
  hoverAttract?: number;
  /** 悬浮时点直径的额外放大比例，默认见 …HOVER_DEFAULTS.sizeBoost */
  hoverSizeBoost?: number;
}

interface Dot {
  cx: number;
  cy: number;
  radius: number;
  alphaFrac: number;
}

const HOVER_DEFAULTS = IMAGE_DOT_MATRIX_HOVER_DEFAULTS;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function ImageDotMatrix({
  src,
  className,
  cellPx = 13,
  minRadiusPx = 1,
  maxRadiusPx = 4.5,
  gamma = 1.3,
  maxAlpha = 1,
  color = "#CDD4DA",
  mouseInteraction = false,
  hoverRadiusPx = HOVER_DEFAULTS.radiusPx,
  hoverAttract = HOVER_DEFAULTS.attract,
  hoverSizeBoost = HOVER_DEFAULTS.sizeBoost,
}: ImageDotMatrixProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // 图片只在 src 变化时重新加载一次，加载完成后触发一次重绘（通过
  // drawRef.current 调用，避免这个 effect 也要依赖一大串调参数值）。
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      drawRef.current();
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

    const [cr, cg, cb] = hexToRgb(color);

    // 采样（computeDots）和逐帧渲染（render）拆成两步：悬浮"聚拢"交互只
    // 需要每帧重新算每个点的位移/半径再画一遍，不需要重新采样整张图——
    // 采样结果（每个点的基准 cx/cy/radius/alphaFrac）缓存进 dots，只在
    // src/尺寸/调参数值变化时重新计算一次。
    const dots: Dot[] = [];
    let width = 0;
    let height = 0;

    function computeDots() {
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

      // object-fit: contain 的换算（不是 cover）——团队卡片又矮又宽
      // （h-[320px] 配一个宽得多的容器），跟素材 16:9 的照片比例差很多，
      // 用 cover 会把画面按容器比例裁掉一大截，正好把笔记本屏幕顶部和
      // 键盘底部切没了。改成整张图等比缩放后居中塞进采样画布，四周留
      // 透明边（本来就没画笔的地方也不会有点），保证素材内容永远完整，
      // 具体在卡片里露出多大/什么位置由外层 transform（右移/下移/大小
      // 三个滑块）单独控制。
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

      dots.length = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = (row * cols + col) * 4;
          const alphaFrac = data[idx + 3] / 255;
          if (alphaFrac <= 0.02) continue;
          const luminance = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
          const curve = Math.pow(luminance, gamma);
          const radius = minRadiusPx + (maxRadiusPx - minRadiusPx) * curve;
          if (radius <= 0.1) continue;
          dots.push({ cx: (col + 0.5) * cellCssW, cy: (row + 0.5) * cellCssH, radius, alphaFrac });
        }
      }
    }

    // 悬浮态下，半径 hoverRadiusPx 内的点被拉向鼠标（位移比例 hoverAttract）
    // 并放大（hoverSizeBoost），越靠近鼠标聚拢得越明显——activity=0（没有
    // 交互或鼠标不在范围内）时，位移/放大项都为 0，画出来跟原来的纯静态
    // 版本完全一致。
    function render(activity: number, pointerX: number, pointerY: number) {
      if (!ctx || width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
      const radius = Math.max(0.0001, hoverRadiusPx);
      for (const dot of dots) {
        let px = dot.cx;
        let py = dot.cy;
        let r = dot.radius;
        if (activity > 0.0005) {
          const ddx = pointerX - dot.cx;
          const ddy = pointerY - dot.cy;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          const falloff = Math.max(0, 1 - dist / radius);
          const hover = activity * falloff * falloff;
          if (hover > 0.0005) {
            px += ddx * hover * hoverAttract;
            py += ddy * hover * hoverAttract;
            r *= 1 + hover * hoverSizeBoost;
          }
        }
        if (r <= 0.05) continue;
        ctx.globalAlpha = dot.alphaFrac * maxAlpha;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const hoverEnabled = mouseInteraction && !prefersReducedMotion();
    const pointerHover = createPointerHoverState(HOVER_DEFAULTS.smoothing);

    function redraw() {
      computeDots();
      render(pointerHover.activity, pointerHover.x, pointerHover.y);
    }

    drawRef.current = redraw;
    redraw();

    const resizeObserver = new ResizeObserver(() => redraw());
    resizeObserver.observe(container);

    // 悬浮"聚拢"的 rAF 循环只在真的悬浮过之后才起来，鼠标从没进过容器的
    // 卡片（团队卡片一次挂载 4 张，只有当前显示的那张会被划到）不会白跑
    // 常驻循环；缓动到 activity≈0 且鼠标已经离开后自动停掉。
    let rafId = 0;
    let looping = false;
    let pointerInside = false;

    function frame() {
      const activity = pointerHover.tick();
      render(activity, pointerHover.x, pointerHover.y);
      if (activity > 0.001 || pointerInside) {
        rafId = requestAnimationFrame(frame);
      } else {
        looping = false;
      }
    }

    function ensureLoop() {
      if (looping) return;
      looping = true;
      rafId = requestAnimationFrame(frame);
    }

    function handlePointerMove(event: PointerEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const inside =
        rect.width > 0 &&
        rect.height > 0 &&
        localX >= 0 &&
        localX <= rect.width &&
        localY >= 0 &&
        localY <= rect.height;
      pointerInside = inside;
      if (inside) {
        // 团队卡片外层有一个 scale(sizePercent/100) 的祖先 transform（见
        // TeamSection 的位置/大小滑块），getBoundingClientRect 量出来的是
        // 缩放后的屏幕尺寸，但 dots 里的 cx/cy 是按 container.clientWidth/
        // Height（缩放前的本地坐标系）算的——这里按 width/height 相对
        // rect.width/height 的比例把鼠标坐标换算回同一套坐标系，否则悬浮
        // 判定范围/聚拢方向在缩放后的卡片上会跟鼠标实际位置对不上。
        const scaleX = rect.width > 0 ? width / rect.width : 1;
        const scaleY = rect.height > 0 ? height / rect.height : 1;
        pointerHover.setActive(localX * scaleX, localY * scaleY);
      } else {
        pointerHover.setInactive();
      }
      ensureLoop();
    }

    function handlePointerLeaveWindow() {
      pointerInside = false;
      pointerHover.setInactive();
      ensureLoop();
    }

    if (hoverEnabled) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("blur", handlePointerLeaveWindow);
      document.addEventListener("pointerleave", handlePointerLeaveWindow);
    }

    return () => {
      resizeObserver.disconnect();
      if (hoverEnabled) {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("blur", handlePointerLeaveWindow);
        document.removeEventListener("pointerleave", handlePointerLeaveWindow);
      }
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    cellPx,
    minRadiusPx,
    maxRadiusPx,
    gamma,
    maxAlpha,
    color,
    mouseInteraction,
    hoverRadiusPx,
    hoverAttract,
    hoverSizeBoost,
  ]);

  return (
    <div ref={containerRef} aria-hidden="true" className={`size-full ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
