"use client";

import { useState } from "react";

import { CtaButton } from "@/components/CtaButton";
import { CrystalCardGeometry } from "@/components/CrystalCardGeometry";
import { eMono } from "@/lib/eleven";

// AI 社群板块（首页方案 B）——落在 #EEEEF0 浅色底上。
//
//   · 从星空进入本板块的过渡是本组件顶部那**单层** .seam-arc 圆弧渐变
//     （bottom-full，随滚动跟板块一起上升，随 --universe-ai-ready 淡入）。
//     顶端与深空同色、底端 #EEEEF0，本板块直接同色接上。
//   · 标题 + 简介 + 「了解详情」。
//   · 四张卡片横向平均排布；默认全部收起、不显示详情。鼠标悬浮（或键盘
//     聚焦）到某一张，这张卡拓宽、浮现分隔线 + 详情描述，其余卡片等比收窄。
//
// 六个原始维度按「内容 / 工具 / 连接 / 领航」合并为四张卡。移动端（<md）
// 竖向堆叠，四张卡详情全部展开、不依赖悬浮。

interface CommunityCard {
  /** 卡片右上角的 mono 大写标签 */
  tag: string;
  /** 卡片主标题 */
  label: string;
  /** 展开后的详情描述 */
  description: readonly [string, string];
}

const cards: CommunityCard[] = [
  {
    tag: "INSIGHT",
    label: "前沿内容",
    description: [
      "每周精选值得关注的 AI 动态与趋势，过滤重复噪音；",
      "结合深度长文与真实案例，留下可复用的方法。",
    ],
  },
  {
    tag: "TOOLING",
    label: "工具教程",
    description: [
      "精选值得投入时间的 AI 工具，讲清配置与核心用法；",
      "结合真实场景和避坑提示，把工具嵌入日常工作流。",
    ],
  },
  {
    tag: "NETWORK",
    label: "社群连接",
    description: [
      "线上线下沙龙聚焦具体议题，邀请一线实践者分享；",
      "在同频圈子交换资源与经验，带走可执行的收获。",
    ],
  },
  {
    tag: "CONTRIBUTE",
    label: "成为领航员",
    description: [
      "持续输出、组织活动或帮助他人，可申请成为领航员；",
      "获得专属资源与深度连接，共同定义社群价值。",
    ],
  },
];

export function AiCommunityCarousel() {
  // 默认四张卡都收起、不显示详情；鼠标悬浮（或键盘聚焦）到某一张才展开，
  // 鼠标离开整组恢复全部收起。
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="ai" className="relative w-full overflow-x-clip bg-[#EEEEF0] text-[#1c1917]">
      {/* ── 业务介绍 → 本板块的过渡缝：**单层**中央向下凹的圆弧渐变。
           顶部与深空同色 (#332161)、底部落到 #EEEEF0，感知空间插值 + 一层
           噪点消 banding（.seam-arc / .seam-grain 在 globals.css）。整条缝
           只有这一层——UniverseTransition 那边不再画 wash / 白幕。
           随 --universe-ai-ready 淡入；顶端同色所以淡入只在下半段可见。
           高度用 --seam-arc-h，和 VariantEditorial 里 <main> 的负边距耦合。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-full"
        style={{
          height: "var(--seam-arc-h, 108vh)",
          opacity: "var(--universe-ai-ready, 0)",
          willChange: "opacity",
        }}
      >
        <div className="seam-arc absolute inset-0" />
        <div className="seam-grain absolute inset-0" />
      </div>
      {/* 内容顶部对齐、只留很窄的顶部留白：配合上面那道弧与 VariantEditorial 里
          main 的大负上边距，弧沿升上来后标题紧跟其后。底部留白照旧，给下方 FDE
          板块留呼吸。 */}
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col justify-start gap-14 px-6 pb-28 pt-[3vh] md:px-12 md:pt-[4vh]">
        {/* ── 抬头 ── */}
        <div className="reveal flex flex-col gap-5">
          <div>
            <h2
              className={`${eMono} whitespace-nowrap text-[clamp(40px,5vw,56px)] font-bold leading-[0.95] tracking-[-0.02em] text-[#1c1917]`}
            >
              AI社群
            </h2>
            <p className={`${eMono} mt-2 text-[12px] text-[#78716c]`}>新岛AI</p>
          </div>
          <p className="max-w-[560px] text-[14px] leading-[1.8] text-[#57534e]">
            3000+ 行业先行者的选择，用最低成本保持对 AI 前沿的持续感知。每日精选全球顶尖 AI
            研究、产品动态与实战案例，把 AI 能力转化为实际生产力——无论你是开发者、创业者还是企业
            决策者，这里都是你连接 AI 未来的第一入口。
          </p>
          <CtaButton href="/ai" size="md" className="w-fit">
            了解详情
          </CtaButton>
        </div>

        {/* ── 四张卡片：横向平均排布，悬浮拓宽 ── */}
        <div
          className="flex flex-col gap-3 md:h-[420px] md:flex-row"
          onMouseLeave={() => setActive(null)}
        >
          {cards.map((card, index) => {
            const isActive = active === index;
            return (
              <article
                key={card.label}
                tabIndex={0}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                data-active={isActive}
                style={{ flexGrow: isActive ? 2.6 : 1, flexBasis: 0 }}
                className={`group relative flex min-w-0 cursor-default flex-col justify-between overflow-hidden rounded-2xl border p-6 outline-none transition-[flex-grow,background-color,border-color,box-shadow] duration-500 ease-out max-md:!grow-0 ${
                  isActive
                    ? "border-black/[0.12] bg-white shadow-[0_20px_60px_-30px_rgba(28,25,23,0.35)]"
                    : "border-black/[0.08] bg-white/45 hover:bg-white/70"
                }`}
              >
                {/* 标签行 */}
                <div className="flex items-baseline justify-between gap-4">
                  <span
                    className={`${eMono} text-[10px] uppercase tracking-[0.22em] text-[#6b7280]`}
                  >
                    {card.tag}
                  </span>
                  <span className={`${eMono} shrink-0 text-[10px] text-[#a8a29e]`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                {/* 与 Hero 水晶球同材质语言的 3D 几何体 */}
                <CrystalCardGeometry variant={index} active={isActive} />

                {/* 标题 + 展开详情 */}
                <div>
                  <h3 className="text-[20px] font-medium tracking-[-0.01em] text-[#1c1917]">
                    {card.label}
                  </h3>
                  <div
                    className="grid transition-[grid-template-rows,opacity] duration-500 ease-out max-md:!grid-rows-[1fr] max-md:!opacity-100"
                    style={{
                      gridTemplateRows: isActive ? "1fr" : "0fr",
                      opacity: isActive ? 1 : 0,
                    }}
                  >
                    <div className="overflow-hidden">
                      <p className="mt-4 min-h-[45.5px] w-full text-[13px] leading-[1.75] text-[#57534e]">
                        {card.description.map((line) => (
                          <span key={line} className="block whitespace-nowrap">
                            {line}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
