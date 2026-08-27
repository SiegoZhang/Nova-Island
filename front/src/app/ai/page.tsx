import type { Metadata } from "next";
import Link from "next/link";

import { AiCommunitySection } from "@/components/AiCommunitySection";
import { Footer } from "@/components/Footer";
import { GridRails } from "@/components/GridRails";
import { HeroCtas } from "@/components/HeroCtas";
import { Navbar } from "@/components/Navbar";
import { PricingFaqSection } from "@/components/PricingFaqSection";
import { SectionDivider } from "@/components/SectionDivider";
import { VideoDotMatrix } from "@/components/VideoDotMatrix";
import { eBtnPrimary, eRailContainer, ePageContainer } from "@/lib/eleven";

export const metadata: Metadata = {
  title: "AI社群 · 新岛",
  description: "保持对行业前沿的持续感知，与同频的人一起走得更远。",
};

export default function AiCommunityPage() {
  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <Navbar />
      <main className="relative">
        <GridRails />
        <section id="hero" className="relative h-[520px] bg-[#fdfcfc]">
          <div
            className={`relative z-10 flex h-full items-start justify-center overflow-hidden ${eRailContainer}`}
          >
            <div className="relative flex flex-col items-center px-6 pt-[140px] text-center">
              <p className="reveal text-[15px] font-medium text-[#868686]">
                AI社群
              </p>

              <h1 className="reveal reveal-delay-1 mt-5 text-[clamp(56px,11vw,84px)] font-semibold leading-[1.05] tracking-[-0.03em] text-[#1c1917]">
                AI社群
              </h1>

              <p className="reveal reveal-delay-2 mt-8 max-w-[600px] text-[18px] leading-[1.6] text-[#868686]">
                保持对行业前沿的持续感知，与同频的人一起走得更远。
              </p>

              <HeroCtas />
            </div>
          </div>
        </section>

        <SectionDivider />

        <section className="bg-[#fdfcfc] py-20">
          <div
            className={`${ePageContainer} grid gap-14 md:grid-cols-2 md:items-center`}
          >
            <div>
              <h2 className="text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[32px]">
                为什么加入 AI社群？
              </h2>
              <p className="mt-5 text-[16px] leading-[1.65] text-[#57534e]">
                AI
                领域信息更新极快，噪音极多。新岛
                AI社群专注于去噪与提炼——每周筛选真正值得关注的前沿动态、工具与方法论，帮助你把注意力花在刀刃上。
              </p>
              <p className="mt-4 text-[16px] leading-[1.65] text-[#57534e]">
                这里既有内容消费，也有主动连接。社群成员来自产品、工程、运营、管理等各个方向，共同的底色是对
                AI 落地的真实兴趣。
              </p>
            </div>
            <div
              aria-hidden="true"
              className="aspect-[4/3] rounded-2xl border border-[#efefef] bg-[#F8F8F8]"
            />
          </div>
        </section>

        <SectionDivider bottomBg="#F8F8F8" />

        <section className="bg-[#F8F8F8] py-20">
          <div className={ePageContainer}>
            <h2 className="mb-10 text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[32px]">
              社群包含什么
            </h2>
            <AiCommunitySection variant="embedded" />
          </div>
        </section>

        <SectionDivider topBg="#F8F8F8" />

        <section className="bg-[#fdfcfc] py-20">
          <div className={ePageContainer}>
            <div className="relative flex flex-col items-start justify-between gap-8 overflow-hidden rounded-2xl bg-[#2b7fff] p-10 md:flex-row md:items-center md:p-16">
              <div className="absolute inset-0 z-0">
                <VideoDotMatrix
                  src="/videos/ai-community.mp4"
                  background="#2b7fff"
                  colorLow="#ffffff"
                  colorHigh="#ffffff"
                  gridCols={64}
                  gridRows={16}
                  dotMaxSize={5}
                />
              </div>
              <div className="relative z-10">
                <h2 className="text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-white">
                  准备好了吗？
                </h2>
                <p className="mt-2.5 text-[16px] leading-[1.65] text-white/75">
                  加入新岛 AI社群，与真正在做 AI 的人同行。
                </p>
              </div>
              <Link href="/contact" className={`${eBtnPrimary} relative z-10`}>
                立即加入
              </Link>
            </div>
          </div>
        </section>

        <SectionDivider bottomBg="#F8F8F8" />

        <PricingFaqSection />
      </main>
      <Footer />
    </div>
  );
}
