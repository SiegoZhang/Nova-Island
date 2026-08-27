import { IMAGE_SAMPLED_DEFAULT_TUNING } from "@/lib/dotSystem/tokens";

import { createImageSampledMode } from "./imageSampledField";

// 「工具教程」：1:1 复刻参考图 assembly-reference.png（知识沉淀、系统构建
// 的柱状堆叠点阵，像一座由点阵搭出来的城市天际线）的点阵风格，采样算法与
// 其余 mode 共用 imageSampledField，只是参考图和对比度参数不同。
export const assemblyMode = createImageSampledMode({
  ...IMAGE_SAMPLED_DEFAULT_TUNING,
  referenceSrc: "/images/assembly-reference.png",
  // 参考图最深像素偏离纯白约 0.63——比 resonance/gravity 参考图浅很多，
  // 整体没有非常深的核心，用这个数做归一化避免大片区域被压到最大值。
  expectedMaxDeviation: 0.6,
});
