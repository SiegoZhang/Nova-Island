"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CtaButton } from "@/components/CtaButton";
import { ChevronDownIcon } from "@/components/icons";
import { eMono } from "@/lib/eleven";

// FDE 业务板块——排版对齐 AI社群（AiCommunityCarousel）：
//   · 左列：FDE 标题 + 简介 + 「了解详情」，滚动时保持不变。
//   · 背景：底层蓝 / 青 / 淡紫流彩，上层覆盖整面的半透明雾化玻璃。
//   · 右列：NN/03 编号 + 卡片标题 + 描述，随滚轮 / 上下按钮在 3 张卡之间切换。
//
// 交互跟 AiCommunityCarousel 同一套：纵向滚轮切右列，一次手势一格，空闲防抖，
// 到首尾放行交还给 SlideDeck 翻屏。

const WHEEL_GESTURE_IDLE_MS = 200;

const highlights = [
  {
    step: "深度合作头部企业",
    description:
      "深入金融、工业、新零售等细分场景，与行业头部企业建立深度绑定的合作关系，而非浅层的项目外包。",
  },
  {
    step: "客户平均效率提升",
    description:
      "基于真实交付周期的量化统计，用工程化能力驱动业务流程实质提效，而不是停留在概念验证阶段。",
  },
  {
    step: "老客户年度续约率",
    description:
      "高粘度的共创陪跑机制深受客户信赖——交付只是起点，我们持续陪伴客户从 0 到 1 再到规模化。",
  },
] as const;

export function FdeSection() {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const wheelIdleRef = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    if (next < 0 || next >= highlights.length || next === activeRef.current) return;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const dir = event.deltaY > 0 ? 1 : -1;
      const next = activeRef.current + dir;
      if (next < 0 || next >= highlights.length) return; // 首尾放行 → SlideDeck 翻屏

      event.preventDefault();
      if (wheelIdleRef.current === null) {
        go(next);
      } else {
        window.clearTimeout(wheelIdleRef.current);
      }
      wheelIdleRef.current = window.setTimeout(() => {
        wheelIdleRef.current = null;
      }, WHEEL_GESTURE_IDLE_MS);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelIdleRef.current !== null) window.clearTimeout(wheelIdleRef.current);
    };
  }, [go]);

  const item = highlights[active];

  return (
    <section
      id="fde"
      className="relative left-1/2 w-screen -translate-x-1/2 overflow-x-clip bg-[#ddd8e8]"
    >
      {/* AI 社群→FDE：与上一处一致的宽而浅圆弧，进入本屏后白色柔和退去。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-full z-[1] h-[78vh]"
        style={{
          background:
            "radial-gradient(ellipse 115% 44% at 50% 108%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.98) 56%, rgba(255,255,255,0.82) 68%, rgba(255,255,255,0.46) 82%, rgba(255,255,255,0.14) 93%, rgba(255,255,255,0) 100%)",
        }}
      />

      {/* 全屏底层流彩：脱离 1440px 内容容器，始终横铺整个视口。 */}
      <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#ddd8e8]">
        <div className="fde-flow-color absolute inset-[-18%]" />
        <div className="fde-flow-ribbon absolute -left-[18%] bottom-[-16%] h-[72%] w-[112%] -rotate-[11deg] rounded-[50%]" />
        <div className="fde-flow-ribbon fde-flow-ribbon-secondary absolute -right-[28%] top-[5%] h-[54%] w-[88%] rotate-[14deg] rounded-[50%]" />
        <div className="fde-glass-stars absolute inset-0 opacity-70" />
        <div className="fde-glass-surface absolute inset-[1px] border border-white/60 bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(79,48,121,0.2)] backdrop-blur-[20px]" />
        <div
          className="absolute inset-x-0 top-0 h-[42vh]"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.82) 16%, rgba(255,255,255,0.46) 40%, rgba(255,255,255,0.16) 68%, rgba(255,255,255,0) 100%)",
          }}
        />
      </div>

      <div
        ref={rootRef}
        style={{ opacity: "clamp(0, calc((var(--ai-fde-t, 1) - 0.55) / 0.35), 1)" }}
        className="relative mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col overflow-hidden md:h-[100svh]"
      >
        <div className="relative z-10 flex flex-1 flex-col gap-14 px-6 py-24 md:grid md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(280px,340px)] md:items-center md:gap-8 md:px-12 md:py-0">
          {/* ── 左列 telemetry ── */}
          <div className="reveal flex flex-col gap-7">
            <div>
              <h2
                data-title-reveal="1"
                className={`${eMono} whitespace-nowrap text-[clamp(40px,5vw,56px)] font-bold leading-[0.95] tracking-[-0.02em] text-[#172331]`}
              >
                FDE业务
              </h2>
              <p data-title-reveal="2" className={`${eMono} mt-2 text-[12px] text-[#61798a]`}>
                新岛FDE
              </p>
            </div>
            <div>
              <p className={`${eMono} text-[9px] uppercase tracking-[0.15em] text-[#7590a1]`}>Intro</p>
              <p className={`${eMono} mt-2 text-[11px] leading-[1.75] text-[#536c7d]`}>
                Forward Deployed Engineer——区别于标准化方案，我们把工程师直接派到客户的真实业务
                现场，深入具体场景做定制交付，用工程化能力驱动 AI 的规模化落地与持续见效，而不是
                停在概念验证阶段。
              </p>
            </div>
            <CtaButton href="/fde" size="md" className="w-fit">
              了解详情
            </CtaButton>
          </div>

          {/* ── 右列：三张卡片的内容，随滚轮切换 ── */}
          <div className="reveal flex flex-col items-end gap-9 md:col-start-3 md:pr-12">
            <div key={active} className="flex w-full flex-col items-end text-right">
              <p className={`${eMono} rise-in text-[10px] text-[#61798a]`}>
                {String(active + 1).padStart(2, "0")}/{String(highlights.length).padStart(2, "0")}
              </p>
              <h3
                className={`${eMono} rise-in mt-1 text-[22px] font-bold text-[#172331] md:text-[26px]`}
                style={{ animationDelay: "90ms" }}
              >
                {item.step}
              </h3>
              <p
                className={`${eMono} rise-in mt-5 max-w-[320px] text-[11px] leading-[1.8] text-[#536c7d]`}
                style={{ animationDelay: "180ms" }}
              >
                {item.description}
              </p>
            </div>
          </div>
        </div>

        {/* 上 / 下切换按钮 */}
        <div className="absolute bottom-8 right-6 z-10 flex flex-col gap-1 md:bottom-[7%] md:right-[7%]">
          <button
            type="button"
            aria-label="上一张卡片"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            className="flex size-7 items-center justify-center rounded-[4px] border border-[#172331]/10 text-[#61798a] transition-colors hover:border-[#172331]/25 hover:text-[#172331] disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="下一张卡片"
            onClick={() => go(active + 1)}
            disabled={active === highlights.length - 1}
            className="flex size-7 items-center justify-center rounded-[4px] border border-[#172331]/10 text-[#61798a] transition-colors hover:border-[#172331]/25 hover:text-[#172331] disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3" />
          </button>
        </div>
      </div>
    </section>
  );
}
