import { IMAGE_SAMPLED_DEFAULT_TUNING } from "@/lib/dotSystem/tokens";

import { createImageSampledMode } from "./imageSampledField";

// 「成为领航员」：1:1 复刻参考图 breakaway-reference.png（突破边界、引领
// 新局的流线汇聚成一颗高亮绿色核心）的点阵风格，采样算法与其余 mode 共用
// imageSampledField，只是参考图和对比度参数不同。
export const breakawayMode = createImageSampledMode({
  ...IMAGE_SAMPLED_DEFAULT_TUNING,
  referenceSrc: "/images/breakaway-reference.png",
  // 参考图最深的蓝色像素偏离纯白约 0.75——那颗高亮绿色核心本身饱和度高但
  // 不算最"深"（RGB 总和不是最低），靠格内最深像素定颜色的逻辑仍能在它
  // 主导的格子里正确取到绿色，这里只是给蓝色部分的深浅关系定归一化基准。
  expectedMaxDeviation: 0.72,
});
