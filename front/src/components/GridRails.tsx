"use client";

import { eRailContainer } from "@/lib/eleven";
import { useHeroTheme } from "@/lib/heroTheme";

// 必须和 HeroSection 的 h-[740px] 保持一致——Hero 区域内的竖线单独控制显隐，
// 剩余页面部分的竖线不受影响。
const HERO_HEIGHT_PX = 740;

/**
 * 贯穿整页的竖向网格线，与 SectionDivider 的横线在容器边界相交，
 * 交界处由 SectionDivider 里的留白方块覆盖、断开，方块中心是一个小圆点。仅桌面端显示。
 * Hero 切到「光电流动」这种自带浅色点阵背景的效果时，Hero 区域内的竖线
 * 会显得多余，通过 heroTheme context 单独跳过这一段。
 */
export function GridRails() {
  const { hideHeroRails } = useHeroTheme();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 hidden md:block"
    >
      <div className={`relative h-full ${eRailContainer}`}>
        {!hideHeroRails && (
          <>
            <div
              className="absolute top-0 left-0 w-px bg-[#efefef]"
              style={{ height: HERO_HEIGHT_PX }}
            />
            <div
              className="absolute top-0 right-0 w-px bg-[#efefef]"
              style={{ height: HERO_HEIGHT_PX }}
            />
          </>
        )}
        <div
          className="absolute bottom-0 left-0 w-px bg-[#efefef]"
          style={{ top: HERO_HEIGHT_PX }}
        />
        <div
          className="absolute right-0 bottom-0 w-px bg-[#efefef]"
          style={{ top: HERO_HEIGHT_PX }}
        />
      </div>
    </div>
  );
}
