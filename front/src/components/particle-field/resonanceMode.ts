import { IMAGE_SAMPLED_DEFAULT_TUNING } from "@/lib/dotSystem/tokens";

import { createImageSampledMode } from "./imageSampledField";

// 「同频集会」：1:1 复刻参考图 同频集会.png 的点阵风格，直接采样参考图本身
// 的像素（跟 flowMode 共用 imageSampledField 的采样算法），而不是用节点/
// 波纹公式去"模拟"出一个近似的样子。
export const resonanceMode = createImageSampledMode({
  ...IMAGE_SAMPLED_DEFAULT_TUNING,
  referenceSrc: "/images/resonance-reference.png",
  // 参考图里最深的核心像素亮度大约在 40~90（0~255），对应偏离纯白约
  // 0.65~0.85——用这个数给"偏离程度"做归一化，才能让参考图里本来就不算
  // 极端的深浅关系，转成点阵后还是同样的深浅关系，而不是被压扁或过曝。
  expectedMaxDeviation: 0.82,
});
