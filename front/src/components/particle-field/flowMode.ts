import { IMAGE_SAMPLED_DEFAULT_TUNING } from "@/lib/dotSystem/tokens";

import { createImageSampledMode } from "./imageSampledField";

// 「每周风向」：1:1 复刻参考图 flow-reference.png（信息流动、趋势涌现的
// 波浪点阵）的点阵风格，采样算法与 resonanceMode 共用 imageSampledField，
// 只是参考图和对比度参数不同。
export const flowMode = createImageSampledMode({
  ...IMAGE_SAMPLED_DEFAULT_TUNING,
  referenceSrc: "/images/flow-reference.png",
  // 参考图里最深的核心像素偏离纯白约 0.76——比 resonance 参考图略浅，用这
  // 个数做归一化，避免深浅关系被压扁。
  expectedMaxDeviation: 0.72,
});
