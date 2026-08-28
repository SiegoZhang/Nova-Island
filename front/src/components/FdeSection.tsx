"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CardBreadcrumb } from "@/components/CardBreadcrumb";
import { FdeBrandGrid } from "@/components/FdeBrandGrid";
import { FdeGlobeLogos } from "@/components/FdeGlobeLogos";
import { ArrowRightIcon } from "@/components/icons";
import { eEyebrowDark, eMono, ePageContainer } from "@/lib/eleven";

// FDE 卡片：右侧点阵地球「保持不动」，作为整张卡片固定的背景元素；切换分页
// 时只有左侧文案 + CTA、以及浮在地球上方的那层卡片跟着换。三张卡都叠在同一
// 个位置，靠 opacity + 轻微纵向位移做交叉淡入淡出，不再是整卡上下翻。
// 悬浮在卡片区域时纵向滚轮翻页，一次手势翻一张，到首尾不再拦截。

const highlights = [
  {
    step: "01",
    title: "深度合作头部企业",
    description:
      "深入金融、工业、新零售等细分场景，与行业头部企业建立深度绑定的合作关系，而非浅层的项目外包。",
    evidenceLabel: "合作品牌",
  },
  {
    step: "02",
    title: "客户平均效率提升",
    description:
      "基于真实交付周期的量化统计，用工程化能力驱动业务流程实质提效，而不是停留在概念验证阶段。",
    evidenceLabel: "效率提升案例",
  },
  {
    step: "03",
    title: "老客户年度续约率",
    description:
      "高粘度的共创陪跑机制深受客户信赖——交付只是起点，我们持续陪伴客户从 0 到 1 再到规模化。",
    evidenceLabel: "陪跑方法论",
  },
] as const;

// 卡02「客户平均效率提升」的实证案例——用真实交付数据代替空泛的百分比。
const efficiencyCases = [
  { label: "新希望乳业", stat: "1:5", description: "新品 ROI 从 1:0.5 提升至 1:5" },
  { label: "永和豆浆", stat: "1,200万+", description: "矩阵内容引流，单链接销售额" },
  { label: "美妆投放", stat: "×5", description: "达人搜索效率最高提升" },
] as const;

// 卡03「老客户年度续约率」用六步陪跑方法论时间线回答「为什么客户会持续续约」。
const partnershipSteps = [
  { step: "01", label: "业务诊断", description: "明确目标与条件" },
  { step: "02", label: "场景筛选", description: "评估价值与难度" },
  { step: "03", label: "小范围试点", description: "约定责任与指标" },
  { step: "04", label: "搭建与培训", description: "交付系统与规范" },
  { step: "05", label: "验收复盘", description: "用指标检验效果" },
  { step: "06", label: "规模化复制", description: "扩展更多岗位场景" },
] as const;

const SWITCH_MS = 520;

function EfficiencyOverlay() {
  return (
    <div className="flex w-full max-w-[380px] flex-col gap-3">
      {efficiencyCases.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-[3px]"
        >
          <p className={`text-[26px] leading-none font-bold text-white md:text-[30px] ${eMono}`}>
            {item.stat}
          </p>
          <p className="mt-2 text-[13px] font-medium text-white/80">{item.label}</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-white/50">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function TimelineOverlay() {
  return (
    <div className="grid w-full max-w-[400px] grid-cols-2 gap-2.5">
      {partnershipSteps.map((item) => (
        <div
          key={item.step}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 backdrop-blur-[3px]"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70">
            {item.step}
          </span>
          <p className="mt-2 text-[13px] font-medium text-white">{item.label}</p>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-white/45">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function FdeSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const stackRef = useRef<HTMLDivElement>(null);

  const goTo = (index: number) => {
    if (index < 0 || index >= highlights.length || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    activeIndexRef.current = index;
    setActiveIndex(index);
    window.setTimeout(() => {
      isAnimatingRef.current = false;
    }, SWITCH_MS);
  };

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex = activeIndexRef.current + direction;
      if (nextIndex < 0 || nextIndex >= highlights.length) return;
      event.preventDefault();
      goTo(nextIndex);
    };

    stack.addEventListener("wheel", handleWheel, { passive: false });
    return () => stack.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <section id="fde" className="w-full">
      <div className={ePageContainer}>
        <div data-parallax className="reveal mb-10 text-center">
          <p className={eEyebrowDark}>FDE业务</p>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-[#f5f5f5] md:text-[40px]">
            从认知到落地的工程化路径
          </h2>
          <p className="mx-auto mt-3 max-w-[540px] text-[16px] leading-[1.65] text-[#a1a1aa]">
            Forward Deployed Engineer — 区别于标准化方案，我们深入客户的真实业务场景，以工程化能力驱动
            AI 的规模化落地与持续见效。
          </p>
        </div>

        <div
          ref={stackRef}
          // 卡片宽度不变（贴 ePageContainer，距左右网格竖线 36px），桌面高度
          // 改由 16:9 长宽比决定，跟 AI社群 轮播卡在满宽下的比例保持一致；
          // 移动端卡片转竖向，沿用固定高度。
          className="reveal relative h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[#101012] md:aspect-auto md:h-[min(58vh,620px)]"
        >
          {/* 固定不动的点阵地球——整张卡片共用一个实例，切换分页时它不参与
              任何过渡。占右半，桌面才显示。 */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[54%] items-center justify-center md:flex">
            <FdeGlobeLogos
              showLogos={false}
              className="relative aspect-square h-full max-h-[440px] w-full max-w-[440px]"
            />
          </div>

          {highlights.map(({ step, title, description }, index) => {
            const active = index === activeIndex;
            const offset = index < activeIndex ? -16 : 16;
            return (
              <div
                key={step}
                aria-hidden={!active}
                className="absolute inset-0 px-8 py-10 transition-[opacity,transform] duration-500 ease-out md:px-14 md:py-16"
                style={{
                  opacity: active ? 1 : 0,
                  transform: active ? "translateY(0)" : `translateY(${offset}px)`,
                  pointerEvents: active ? "auto" : "none",
                  zIndex: active ? 2 : 1,
                }}
              >
                <div className="grid h-full items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-12">
                  <div className="max-w-[480px]">
                    <span className={`${eMono} text-[13px] tracking-[0.04em] text-white/35`}>
                      {step} / 0{highlights.length}
                    </span>
                    <h3 className="mt-3 text-[24px] leading-[1.3] font-semibold text-[#F8FAFA] md:text-[32px]">
                      {title}
                    </h3>
                    <p className="mt-4 text-[15px] leading-[1.7] text-[#A3A5A6] md:text-[16px]">
                      {description}
                    </p>
                    <Link
                      href="/fde"
                      className="mt-8 inline-flex w-fit items-center justify-center gap-2 rounded-full bg-[#1A38CE] px-7 py-3 text-[14px] font-semibold tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[#1A38CE]/90 active:scale-[0.97]"
                    >
                      深度了解
                      <ArrowRightIcon className="size-3.5" strokeWidth={1.8} />
                    </Link>
                  </div>

                  {/* 浮在地球上方、随分页切换的那层卡片。桌面对齐地球的方形区域。 */}
                  <div className="relative hidden aspect-square h-full max-h-[440px] w-full max-w-[440px] items-center justify-center md:flex">
                    {index === 0 && <FdeBrandGrid />}
                    {index === 1 && <EfficiencyOverlay />}
                    {index === 2 && <TimelineOverlay />}
                  </div>
                </div>
              </div>
            );
          })}

          <CardBreadcrumb
            currentIndex={activeIndex}
            total={highlights.length}
            onSelect={goTo}
            className="absolute bottom-8 left-8 z-30 md:bottom-12 md:left-14"
          />
        </div>
      </div>
    </section>
  );
}
