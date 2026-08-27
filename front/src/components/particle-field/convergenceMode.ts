import { IMAGE_SAMPLED_DEFAULT_TUNING } from "@/lib/dotSystem/tokens";

import { createImageSampledMode } from "./imageSampledField";

// 「精选沙龙」：1:1 复刻参考图 convergence-reference.png（多元汇聚、碰撞
// 新知的蝴蝶结/沙漏形汇聚点阵）的点阵风格，采样算法与其余 mode 共用
// imageSampledField，只是参考图和对比度参数不同。
export const convergenceMode = createImageSampledMode({
  ...IMAGE_SAMPLED_DEFAULT_TUNING,
  referenceSrc: "/images/convergence-reference.png",
  // 参考图核心像素偏离纯白约 0.79，与 resonance 参考图接近。
  expectedMaxDeviation: 0.75,
});
