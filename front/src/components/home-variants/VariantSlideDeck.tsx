import { AboutNovaSection } from "@/components/AboutNovaSection";
import { AiCommunityCarousel } from "@/components/AiCommunityCarousel";
import { ContactCtaSection } from "@/components/ContactCtaSection";
import { FdeSection } from "@/components/FdeSection";
import { Footer } from "@/components/Footer";
import { GridOverlay } from "@/components/GridOverlay";
import { HeroSection } from "@/components/HeroSection";
import { Navbar } from "@/components/Navbar";
import { Slide, SlideDeck } from "@/components/SlideDeck";
import { TeamSection } from "@/components/TeamSection";
import { HeroThemeProvider } from "@/lib/heroTheme";

// 首页方案 A —— 整屏幻灯片：每个板块占满一屏，滚轮吸附切换（见 SlideDeck）。
// 原本写在 app/page.tsx 里，现在收进 home-variants/ 作为可切换方案之一，
// 内容一字未改。整页统一纯黑底（#000），板块之间的对比靠深灰卡片面板
// （#101012）与浅色文案建立。
//
// 方案切换机制见 HomeVariantHost / HomeVariantSwitcher：各方案是独立文件，
// 互不影响，加删方案不动这里。
export default function VariantSlideDeck() {
  return (
    <HeroThemeProvider>
      <div className="h-[100svh] overflow-hidden bg-black">
        <Navbar />
        {/* morphBoundaryIndex={2}：AI社群（第 3 屏）→ FDE（第 4 屏）之间启用
            粒子形变过渡——人形粒子聚拢再炸开成点阵地球，见 AiFdeParticleMorph。 */}
        <SlideDeck morphBoundaryIndex={2}>
          <Slide className="bg-black">
            <HeroSection />
          </Slide>
          <Slide className="bg-black">
            <GridOverlay />
            <AboutNovaSection />
          </Slide>
          <Slide className="bg-black">
            <GridOverlay />
            <AiCommunityCarousel />
          </Slide>
          <Slide className="bg-black">
            <GridOverlay />
            <FdeSection />
          </Slide>
          <Slide className="bg-black">
            <GridOverlay />
            <TeamSection />
          </Slide>
          <Slide className="bg-black">
            <GridOverlay />
            <div className="relative z-10 flex min-h-full w-full flex-col">
              <div className="flex flex-1 items-center">
                <ContactCtaSection />
              </div>
              <Footer />
            </div>
          </Slide>
        </SlideDeck>
      </div>
    </HeroThemeProvider>
  );
}
