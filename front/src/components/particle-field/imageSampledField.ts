import { drawDot } from "@/lib/dotSystem/draw";
import { computeCoverRect } from "@/lib/dotSystem/sampling";

import type { FieldConfig, FieldMode, PointerInput } from "./types";
import { clamp } from "./utils";

// 把一张参考图按固定网格采样成点阵——resonance / flow 等多个 mode 共用同一套
// 采样算法，只是各自的参考图和密度/对比度参数不同。核心手法：格子内的
// 「平均偏离度」决定透明度（保留参考图本身的疏密节奏），格子内「最深的一个
// 像素颜色」直接作为点的颜色（不被大片白底稀释成灰紫色）。动效本轮不处理，
// update() 只在图片刚加载完成时做一次性采样。

export interface ImageSampledFieldConfig {
  /** 参考图路径（public 目录下）。 */
  referenceSrc: string;
  /** 网格间距（css px）——决定复刻的精细程度。 */
  step: number;
  minRadius: number;
  maxRadius: number;
  maxAlpha: number;
  /** 参考图最深像素对应的「偏离纯白」比例，用来把偏离度归一化到 0~1。 */
  expectedMaxDeviation: number;
  /** <1 拉高中间调，让偏淡的区域不至于淡到看不见；>1 压低中间调。 */
  alphaGamma: number;
}

interface GridDot {
  x: number;
  y: number;
  alpha: number;
  size: number;
  rgb: [number, number, number];
}

export interface ImageSampledState {
  width: number;
  height: number;
  cols: number;
  rows: number;
  dots: GridDot[];
  imageApplied: boolean;
}

interface SampledCell {
  avgDeviation: number;
  inkR: number;
  inkG: number;
  inkB: number;
}

function buildGrid(cols: number, rows: number, step: number): GridDot[] {
  const dots: GridDot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push({ x: c * step, y: r * step, alpha: 0, size: 0, rgb: [0, 0, 0] });
    }
  }
  return dots;
}

function sampleReferenceImage(
  image: HTMLImageElement,
  width: number,
  height: number,
  cols: number,
  rows: number,
): SampledCell[] | null {
  const { sx, sy, sw, sh } = computeCoverRect(
    image.naturalWidth,
    image.naturalHeight,
    width,
    height,
  );

  const srcW = Math.max(1, Math.round(sw));
  const srcH = Math.max(1, Math.round(sh));
  const off = document.createElement("canvas");
  off.width = srcW;
  off.height = srcH;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  octx.drawImage(image, sx, sy, sw, sh, 0, 0, srcW, srcH);
  const src = octx.getImageData(0, 0, srcW, srcH).data;

  const out: SampledCell[] = new Array(cols * rows);
  const cellW = srcW / cols;
  const cellH = srcH / rows;
  for (let ry = 0; ry < rows; ry++) {
    const y0 = Math.floor(ry * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((ry + 1) * cellH));
    for (let rx = 0; rx < cols; rx++) {
      const x0 = Math.floor(rx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((rx + 1) * cellW));

      let bestSum = 255 * 3 + 1;
      let inkR = 255;
      let inkG = 255;
      let inkB = 255;
      let devTotal = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < srcH; y++) {
        for (let x = x0; x < x1 && x < srcW; x++) {
          const si = (y * srcW + x) * 4;
          const r = src[si];
          const g = src[si + 1];
          const b = src[si + 2];
          const sum = r + g + b;
          devTotal += Math.max(0, 1 - sum / 3 / 255);
          count++;
          if (sum < bestSum) {
            bestSum = sum;
            inkR = r;
            inkG = g;
            inkB = b;
          }
        }
      }

      out[ry * cols + rx] = {
        avgDeviation: count > 0 ? devTotal / count : 0,
        inkR,
        inkG,
        inkB,
      };
    }
  }

  return out;
}

export function createImageSampledMode(opts: ImageSampledFieldConfig): FieldMode<ImageSampledState> {
  const { referenceSrc, step, minRadius, maxRadius, maxAlpha, expectedMaxDeviation, alphaGamma } = opts;

  // 参考图作为静态资源，同一个 Image 元素在多次挂载/resize 之间复用，避免
  // 重复发起网络请求；采样完成前 imageApplied 为 false，dots 保持全透明。
  let cachedImage: HTMLImageElement | null = null;
  let loadingImage: HTMLImageElement | null = null;

  function ensureReferenceImageLoading(): void {
    if (cachedImage || loadingImage) return;
    const img = new window.Image();
    loadingImage = img;
    img.onload = () => {
      cachedImage = img;
      loadingImage = null;
    };
    img.onerror = () => {
      loadingImage = null;
    };
    img.src = referenceSrc;
  }

  function applyReferenceImage(state: ImageSampledState, image: HTMLImageElement): void {
    const cells = sampleReferenceImage(image, state.width, state.height, state.cols, state.rows);
    if (!cells) return;

    for (let idx = 0; idx < state.dots.length; idx++) {
      const dot = state.dots[idx];
      const cell = cells[idx];
      const norm = Math.pow(clamp(cell.avgDeviation / expectedMaxDeviation, 0, 1), alphaGamma);

      dot.alpha = norm * maxAlpha;
      dot.size = minRadius + (maxRadius - minRadius) * norm;
      dot.rgb = [cell.inkR, cell.inkG, cell.inkB];
    }

    state.imageApplied = true;
  }

  function createState(width: number, height: number, _config: FieldConfig): ImageSampledState {
    ensureReferenceImageLoading();
    const cols = Math.ceil(width / step) + 1;
    const rows = Math.ceil(height / step) + 1;
    return {
      width,
      height,
      cols,
      rows,
      dots: buildGrid(cols, rows, step),
      imageApplied: false,
    };
  }

  function update(
    state: ImageSampledState,
    _dtMs: number,
    _elapsedMs: number,
    _pointer: PointerInput,
    _config: FieldConfig,
  ): void {
    if (state.imageApplied) return;
    ensureReferenceImageLoading();
    if (cachedImage) applyReferenceImage(state, cachedImage);
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    state: ImageSampledState,
    width: number,
    height: number,
    config: FieldConfig,
  ): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = config.colors.background;
    ctx.fillRect(0, 0, width, height);

    for (const dot of state.dots) {
      if (dot.alpha <= 0.006 || dot.size <= 0.15) continue;
      drawDot(ctx, dot.x, dot.y, dot.size, dot.alpha, dot.rgb);
    }
  }

  return { createState, update, draw };
}
