import { clamp } from "./math";

/** 通用圆点绘制原语——原来只在 particle-field/imageSampledField.ts 里有
 * 一份写得比较完整的版本，现在提升为共享实现。 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  rgb: [number, number, number],
): void {
  if (alpha <= 0.003 || size <= 0.15) return;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp(alpha, 0, 1)})`;
  ctx.fill();
}
