"use client";

import Link from "next/link";

import { Footer } from "@/components/Footer";
import { HeroThemeProvider } from "@/lib/heroTheme";

import { UniverseTransition } from "./UniverseTransition";

// 首页方案 B —— 「编辑式」版式：浅色杂志排版。
//
// Hero + 「进入球体内部」滚动转场都在 <UniverseTransition> 里：开场是浅色 Hero
// （导航 + 超大「新岛」+ 说明 + 200k + 水晶球在原位），往下滚球从原位放大、穿过
// 玻璃壳进入内部星云空间（配色与球一致），浮现一段业务介绍，再淡回浅色接章节。
//
// 下方章节仍是占位文案，等定稿再逐段换成正式设计。

const chapters = [
  {
    id: "about",
    kicker: "01 — 关于新岛",
    title: "数字时代 AI 原住民的聚集地",
    body:
      "新岛不是又一个工具集合，而是一群把 AI 当作母语的人共同生活的地方。我们相信协作、公开与长期主义，帮助每个成员在 AI 浪潮里找到自己的坐标。",
  },
  {
    id: "community",
    kicker: "02 — AI 社群",
    title: "在真实的项目里学习，而不是在教程里",
    body:
      "每周的公开航行、共创工作坊、以及成员之间的深度连接。社群按兴趣与能力自组织，你可以旁观，也可以随时加入某一次航行。",
  },
  {
    id: "fde",
    kicker: "03 — FDE 前沿部署",
    title: "把最新的模型能力，落到你的业务现场",
    body:
      "FDE（Forward Deployed Engineer）团队与合作伙伴一起，从 0 到 1 交付可用的 AI 系统——不是 PPT，是上线跑起来的东西。",
  },
  {
    id: "team",
    kicker: "04 — 团队",
    title: "一支相信「造物者」文化的小队",
    body:
      "工程、设计、研究与运营在同一张桌子上工作。我们人不多，但每个人都对最终结果负责。",
  },
];

export default function VariantEditorial() {
  return (
    <HeroThemeProvider>
      <div className="min-h-[100svh] bg-[#e7e5e4] text-[var(--nova-text)]">
        <UniverseTransition />

        <main className="relative z-10 bg-[var(--nova-bg)]">
          {chapters.map((c) => (
            <section
              key={c.id}
              id={c.id}
              className="section-container border-t border-[var(--nova-border)] py-24 md:py-32"
            >
              <div className="grid gap-10 md:grid-cols-[0.4fr_0.6fr]">
                <p className="font-[family-name:var(--font-geist-sans)] text-sm uppercase tracking-[0.2em] text-[var(--nova-text-muted)]">
                  {c.kicker}
                </p>
                <div>
                  <h2 className="text-[clamp(1.8rem,3.4vw,2.9rem)] font-medium leading-tight tracking-tight">
                    {c.title}
                  </h2>
                  <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--nova-text-body)]">
                    {c.body}
                  </p>
                </div>
              </div>
            </section>
          ))}

          <section className="section-container border-t border-[var(--nova-border)] py-28 text-center">
            <h2 className="mx-auto max-w-2xl text-[clamp(2rem,4vw,3.25rem)] font-medium leading-tight tracking-tight">
              准备好上岛了吗？
            </h2>
            <div className="mt-10 flex justify-center gap-3">
              <Link href="/community" className="nova-btn-primary">
                进入社区
              </Link>
              <Link href="/community/events" className="nova-btn-secondary">
                查看近期活动
              </Link>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </HeroThemeProvider>
  );
}
