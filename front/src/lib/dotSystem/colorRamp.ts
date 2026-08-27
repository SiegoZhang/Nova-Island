import { lerp } from "./math";
import type { ColorStop, FieldColors, StippleTier } from "./types";

/** ColorStop[] 连续渐变取色——球体流动噪声（FlowNoiseDots）用。 */
export function colorAt(t: number, stops: ColorStop[]): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (clamped >= a.stop && clamped <= b.stop) {
      const localT = (clamped - a.stop) / (b.stop - a.stop || 1);
      return [
        Math.round(lerp(a.rgb[0], b.rgb[0], localT)),
        Math.round(lerp(a.rgb[1], b.rgb[1], localT)),
        Math.round(lerp(a.rgb[2], b.rgb[2], localT)),
      ];
    }
  }
  return stops[stops.length - 1].rgb;
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** deep→mid→light 三段插值取色——particle-field 用。t: 0=最深(核心) 1=最浅(边缘)。 */
export function colorForT(colors: FieldColors, t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < 0.5) return mixRgb(colors.deep, colors.mid, clamped / 0.5);
  return mixRgb(colors.mid, colors.light, (clamped - 0.5) / 0.5);
}

export function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${alpha})`;
}

/** 按密度落在哪一档——EarthStipple 的疏密分档取色用。 */
export function findTier(tiers: StippleTier[], density: number): StippleTier | null {
  for (const tier of tiers) {
    if (density >= tier.minDensity && density < tier.maxDensity) return tier;
  }
  return null;
}
