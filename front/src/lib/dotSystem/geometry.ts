import type { SphereGeometry } from "./types";

export type { SphereGeometry };

// 球体在画布里的圆心/半径计算——原来定义在 FlowNoiseDots.tsx 里，供
// FlowNoiseDots 系列组件与 lib/heroInteractionZones.ts 的鼠标死区判断共用。
// 四个预设对应 Hero 的四种球体布局。

/** 默认：贴容器底部的球冠（球心在容器上方之外，只露出上半球）。 */
export function computeSphereGeometry(w: number, h: number): SphereGeometry {
  const cx = w * 0.5;
  const equatorY = h * 0.27 - 20;
  const rBase = Math.min(Math.min(w, h) * 0.58, equatorY * 0.94);
  const r = Math.min(rBase * 1.1, 290);
  const cy = equatorY;
  return { cx, cy, r };
}

/** 屏幕正中的完整球体——「环绕方块」效果用。 */
export function computeSphereGeometryCentered(w: number, h: number): SphereGeometry {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.min(Math.min(w, h) * 0.47, 410);
  return { cx, cy, r };
}

/** 沉到容器底部之下的"地平线"布局——「地平线」效果用。 */
export function computeSphereGeometryBottom(w: number, h: number): SphereGeometry {
  const cx = w * 0.5;
  const domeTopY = h * 0.68;
  const r = Math.min(Math.min(w, h) * 0.62, 460);
  const cy = domeTopY + r;
  return { cx, cy, r };
}

/** 沉到文案下方、可见弧度更完整的"光球"布局——「流动光球」效果用。 */
export function computeSphereGeometryLowerOrb(w: number, h: number): SphereGeometry {
  const cx = w * 0.5;
  const domeTopY = h * 0.38;
  const r = Math.min(Math.min(w, h) * 0.72, 520);
  const cy = domeTopY + r;
  return { cx, cy, r };
}
