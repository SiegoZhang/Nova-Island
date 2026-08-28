import { AboutNovaSection } from "@/components/AboutNovaSection";
import { AiCommunityCarousel } from "@/components/AiCommunityCarousel";
import { ContactCtaSection } from "@/components/ContactCtaSection";
import { FdeSection } from "@/components/FdeSection";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/HeroSection";
import { Navbar } from "@/components/Navbar";
import { Slide, SlideDeck } from "@/components/SlideDeck";
import { TeamSection } from "@/components/TeamSection";
import { HeroThemeProvider } from "@/lib/heroTheme";

// 首页改成整屏幻灯片：每个板块占满一屏，滚轮吸附切换（见 SlideDeck）。
// 原来的通栏发丝分割线（SectionDivider）和贯穿全页的竖向网格线（GridRails）
// 在分屏语境下不再适用——竖线改由每个屏自带的 rails 复刻，横向分割线
// 整体去掉。整页统一纯黑底（#000），板块之间的对比靠深灰卡片面板（#101012）
// 与浅色文案建立。
export default function Home() {
  return (
    <HeroThemeProvider>
      <div className="h-[100svh] overflow-hidden bg-black">
        <Navbar />
        <SlideDeck>
          <Slide className="bg-black">
            <HeroSection />
          </Slide>
          <Slide rails className="bg-black">
            <AboutNovaSection />
          </Slide>
          <Slide rails className="bg-black">
            <AiCommunityCarousel />
          </Slide>
          <Slide rails className="bg-black">
            <FdeSection />
          </Slide>
          <Slide rails className="bg-black">
            <TeamSection />
          </Slide>
          <Slide className="bg-black">
            <div className="flex min-h-full w-full flex-col">
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
