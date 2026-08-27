// 这些数学原语已经收进 lib/dotSystem/math.ts 统一维护（供球体/疏密点阵等
// 其他点阵效果共用），这里保留原有的导出名做薄转发，避免 6 个 mode 文件
// 和 imageSampledField.ts 的 import 路径跟着大范围改动。
export {
  clamp,
  lerp,
  randRange,
  gaussian,
  smoothstep,
  quadraticBezier,
  easeFactor,
  distanceToSegment,
  type Point,
} from "@/lib/dotSystem/math";
