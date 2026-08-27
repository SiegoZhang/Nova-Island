import { IMAGE_SAMPLED_DEFAULT_TUNING } from "@/lib/dotSystem/tokens";

import { createImageSampledMode } from "./imageSampledField";

// 「超级内容」：1:1 复刻参考图 gravity-reference.png（聚焦核心、深度吸收的
// 向心同心圆点阵）的点阵风格，采样算法与 resonanceMode/flowMode 共用
// imageSampledField，只是参考图和对比度参数不同。
export const gravityMode = createImageSampledMode({
  ...IMAGE_SAMPLED_DEFAULT_TUNING,
  referenceSrc: "/images/gravity-reference.png",
  // 参考图核心像素接近纯色深蓝，偏离纯白约 0.91——比 resonance/flow 参考图
  // 更深，用这个数做归一化，避免核心被过早压到最大值、丢失中心那圈的层次。
  expectedMaxDeviation: 0.85,
});
