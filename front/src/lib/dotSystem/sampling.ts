import { hash } from "./math";

// 三种共享的"从图片提取点阵数据"原语：
// 1. computeCoverRect / sampleImageToGrid —— 按 object-fit: cover 把图片
//    裁到目标宽高比、降采样成 cols x rows 的像素网格。原来在
//    HeroFlowBgTexture.tsx（sampleTextureImage）与 HeroCosmosReveal.tsx
//    （sampleCosmosImage）里各写一份完全相同的实现。
// 2. sampleEarthDensityGrid —— 固定网格把地球贴图采样成陆地/海洋密度网格。
//    原来在 FlowNoiseDots.tsx 与 EarthStipple.tsx 里各写一份几乎相同的实现。
//
// particle-field/imageSampledField.ts 的采样目的不同（保留格内最深像素颜色
// 而非浏览器双线性平均），只复用这里的 computeCoverRect 做裁切矩形计算，
// 采样循环本身保留在原文件。

export interface CoverRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** 按 cover 方式计算源图裁切矩形，使裁出的区域宽高比等于 targetW/targetH。 */
export function computeCoverRect(
  imgW: number,
  imgH: number,
  targetW: number,
  targetH: number,
): CoverRect {
  const targetAspect = targetW / targetH;
  const imgAspect = imgW / imgH;
  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;
  if (imgAspect > targetAspect) {
    sh = imgH;
    sw = sh * targetAspect;
    sx = (imgW - sw) / 2;
    sy = 0;
  } else {
    sw = imgW;
    sh = sw / targetAspect;
    sx = 0;
    sy = (imgH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

export interface SampledImageGrid {
  data: Uint8ClampedArray;
  cols: number;
  rows: number;
}

/** cover 裁切后直接降采样进 cols x rows 的离屏画布——浏览器的缩放绘制自带
 * 双线性平均，等价于给每个格子取区域平均值。 */
export function sampleImageToGrid(
  image: HTMLImageElement,
  width: number,
  height: number,
  cols: number,
  rows: number,
): SampledImageGrid | null {
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;

  const { sx, sy, sw, sh } = computeCoverRect(
    image.naturalWidth,
    image.naturalHeight,
    width,
    height,
  );
  octx.drawImage(image, sx, sy, sw, sh, 0, 0, cols, rows);
  const { data } = octx.getImageData(0, 0, cols, rows);
  return { data, cols, rows };
}

export interface EarthDensityCell {
  /** 归一化坐标，-0.5~0.5。 */
  gx: number;
  gy: number;
  density: number;
  ocean: boolean;
  seed: number;
}

/** 把地球贴图整张（不做 cover 裁切，假定贴图本身已是合适比例）采样成
 * grid x grid 的陆地/海洋密度网格——FlowNoiseDots 与 EarthStipple 共用同一
 * 份采样结果，保证两处的地球轮廓完全一致。 */
export function sampleEarthDensityGrid(
  image: HTMLImageElement,
  grid: number,
): EarthDensityCell[] {
  const off = document.createElement("canvas");
  off.width = grid;
  off.height = grid;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return [];

  octx.drawImage(image, 0, 0, grid, grid);
  const { data } = octx.getImageData(0, 0, grid, grid);

  const cells: EarthDensityCell[] = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const i = (gy * grid + gx) * 4;
      const a = data[i + 3];
      if (a < 60) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3 / 255;
      const ocean = b - Math.max(r, g) > 10 && brightness < 0.8;
      const rnd = hash(gx, gy);

      const base = ocean ? 0.1 : 0.22;
      const inv = Math.pow(1 - brightness, 1.4);
      const density = Math.min(
        1,
        Math.max(0, base + inv * 0.72 + (rnd - 0.5) * 0.12),
      );

      cells.push({
        gx: gx / (grid - 1) - 0.5,
        gy: gy / (grid - 1) - 0.5,
        density,
        ocean,
        seed: rnd,
      });
    }
  }
  return cells;
}
