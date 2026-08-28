"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FdeGlobeLogos } from "@/components/FdeGlobeLogos";
import { ChevronDownIcon } from "@/components/icons";
import { LazyMount } from "@/components/LazyMount";
import { useSlideDeckOptional } from "@/components/SlideDeck";
import { eMono } from "@/lib/eleven";

// FDE 业务板块——排版对齐 AI社群（AiCommunityCarousel）：
//   · 左列：FDE 标题 + 简介 + 「了解详情」，滚动时保持不变。
//   · 中间：点阵地球（FdeGlobeLogos），位置 / 尺寸跟 AI社群那尊人形一致，
//     外面套同心圆 + 十字线 + 角标。滚轮不切换中间元素。
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

  // 翻页粒子形变过渡：点阵地球注册为「fde」落点锚，整屏内容随 --ai-fde-t
  // 反向淡入（粒子层炸开成球后交回给真正的点阵地球），见 AiFdeParticleMorph。
  const registerMorphAnchor = useSlideDeckOptional()?.registerMorphAnchor;
  const globeAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerMorphAnchor?.("fde", globeAnchorRef.current);
    return () => registerMorphAnchor?.("fde", null);
  }, [registerMorphAnchor]);

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
    <section id="fde" className="w-full">
      <div
        ref={rootRef}
        style={{ opacity: "clamp(0, calc((var(--ai-fde-t, 0) - 0.6) / 0.3), 1)" }}
        className="relative mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col overflow-hidden md:h-[100svh]"
      >
        <div className="relative z-10 flex flex-1 flex-col gap-14 px-6 py-24 md:grid md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(280px,340px)] md:items-center md:gap-8 md:px-12 md:py-0">
          {/* ── 左列 telemetry ── */}
          <div className="reveal flex flex-col gap-7">
            <div>
              <h2
                data-title-reveal="1"
                className={`${eMono} whitespace-nowrap text-[clamp(40px,5vw,56px)] font-bold leading-[0.95] tracking-[-0.02em] text-[#f3f4f6]`}
              >
                FDE业务
              </h2>
              <p data-title-reveal="2" className={`${eMono} mt-2 text-[12px] text-[#9ca3af]`}>
                新岛FDE
              </p>
            </div>
            <div>
              <p className={`${eMono} text-[9px] uppercase tracking-[0.15em] text-[#4b5563]`}>Intro</p>
              <p className={`${eMono} mt-2 text-[11px] leading-[1.75] text-[#9ca3af]`}>
                Forward Deployed Engineer——区别于标准化方案，我们把工程师直接派到客户的真实业务
                现场，深入具体场景做定制交付，用工程化能力驱动 AI 的规模化落地与持续见效，而不是
                停在概念验证阶段。
              </p>
            </div>
            <Link
              href="/fde"
              className={`${eMono} inline-flex w-fit items-center rounded-[4px] border border-[#9ca3af] bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#070709] transition-colors hover:bg-[#e5e7eb]`}
            >
              了解详情
            </Link>
          </div>

          {/* ── 中间：点阵地球（位置 / 尺寸对齐 AI社群人形）── */}
          <div
            data-parallax
            className="reveal relative mx-auto aspect-square w-[min(88vw,520px)] md:w-[min(60vh,600px)]"
          >
            {/* 外圈大圆 + 十字线 */}
            <div className="absolute inset-[-2%] rounded-full border border-white/10" />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
            <span
              className={`${eMono} absolute top-1/2 -left-[7%] -translate-y-1/2 text-[12px] text-white/25`}
            >
              +
            </span>
            <span
              className={`${eMono} absolute top-1/2 -right-[7%] -translate-y-1/2 text-[12px] text-white/25`}
            >
              +
            </span>

            {/* 内同心圆 */}
            <div className="absolute inset-[19%] rounded-full border border-white/[0.06]" />

            {/* 点阵地球本体——globeAnchorRef 同时是翻页粒子过渡的「fde」落点锚。 */}
            <div ref={globeAnchorRef} className="absolute inset-[2%] overflow-hidden">
              <LazyMount>
                <FdeGlobeLogos showLogos={false} className="size-full" />
              </LazyMount>
            </div>
          </div>

          {/* ── 右列：三张卡片的内容，随滚轮切换 ── */}
          <div className="reveal flex flex-col items-end gap-9 md:pr-12">
            <div key={active} className="flex w-full flex-col items-end text-right">
              <p className={`${eMono} rise-in text-[10px] text-[#9ca3af]`}>
                {String(active + 1).padStart(2, "0")}/{String(highlights.length).padStart(2, "0")}
              </p>
              <h3
                className={`${eMono} rise-in mt-1 text-[22px] font-bold text-[#f3f4f6] md:text-[26px]`}
                style={{ animationDelay: "90ms" }}
              >
                {item.step}
              </h3>
              <p
                className={`${eMono} rise-in mt-5 max-w-[320px] text-[11px] leading-[1.8] text-[#9ca3af]`}
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
            className="flex size-7 items-center justify-center rounded-[4px] border border-white/10 text-[#9ca3af] transition-colors hover:border-white/25 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="下一张卡片"
            onClick={() => go(active + 1)}
            disabled={active === highlights.length - 1}
            className="flex size-7 items-center justify-center rounded-[4px] border border-white/10 text-[#9ca3af] transition-colors hover:border-white/25 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3" />
          </button>
        </div>
      </div>
    </section>
  );
}
