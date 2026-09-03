"use client";

import { AiCommunityCarousel } from "@/components/AiCommunityCarousel";
import { ContactCtaSection } from "@/components/ContactCtaSection";
import { FdeSection } from "@/components/FdeSection";
import { Footer } from "@/components/Footer";
import { TeamSection } from "@/components/TeamSection";
import { HeroThemeProvider } from "@/lib/heroTheme";

import { HomeNav } from "./HomeNav";
import { SectionRail } from "./SectionRail";
import { UniverseTransition } from "./UniverseTransition";

// 首页方案 B —— 「编辑式」版式。
//
// 结构（从上到下）：
//  0. <HomeNav>：悬浮胶囊导航。**独立 fixed 顶层**，刻意放在下面那个带
//     -translate-x-1/2 的容器之外——transform 祖先会把 fixed 降级成随页面
//     滚动。这样导航永远贴顶、盖在所有内容和转场效果之上。
//  0b. <SectionRail>：右缘页内导航 / 章节进度条（同样独立 fixed 顶层）。
//  1. <UniverseTransition>：浅色 Hero → 水晶球放大穿壳 → 星空铺满 → 星空里
//     浮现一段主营业务介绍并停住。**宇宙内部只展示那段话**。
//  2. AI社群 / FDE / 我们的团队 / 联系我们四个板块，排在宇宙**下方**的正常
//     页面流里，深色背景，逐屏滚动。
//  3. Footer。

export default function VariantEditorial() {
  return (
    <HeroThemeProvider>
      <HomeNav />
      <SectionRail />
      <div className="relative left-1/2 min-h-[100svh] w-screen -translate-x-1/2 bg-[#332161] text-[var(--nova-text)]">
        <UniverseTransition />
        {/* 宇宙下方的板块：逐个板块滚动。星空→AI社群 的过渡是单层 .seam-arc
            圆弧，做在 AiCommunityCarousel 板块自己的顶上（bottom-full），随滚动
            跟板块一起上升 → 和标题恒定间距。`main` 是 z-10、盖在 UniverseTransition
            的 sticky 舞台之上，负上边距（--seam-overlap）让弧+板块在业务介绍读完后
            从视口底缘升进来。弧高 --seam-arc-h 与这个重叠量耦合，都在 globals.css。 */}
        <main
          className="relative z-10 bg-[#332161]"
          style={{ marginTop: "calc(var(--seam-overlap, 8vh) * -1)" }}
        >
          <AiCommunityCarousel />
          <FdeSection />
          <TeamSection />
          <ContactCtaSection />
        </main>
        <Footer />
      </div>
    </HeroThemeProvider>
  );
}
