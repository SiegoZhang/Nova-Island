"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ArrowRightIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { FlagVisual } from "@/components/FlagVisual";
import { NavigatorDotMatrix } from "@/components/NavigatorDotMatrix";
import { ParticleField } from "@/components/particle-field";
import { RingSphereDotMatrix } from "@/components/RingSphereDotMatrix";
import { SalonDotMatrix } from "@/components/SalonDotMatrix";
import { SphereConnectDotMatrix } from "@/components/SphereConnectDotMatrix";
import { ToolDotMatrix } from "@/components/ToolDotMatrix";
import { aiCommunityFeatures as features } from "@/lib/aiCommunityFeatures";
import { eBtnGhost, eEyebrow, ePageContainer } from "@/lib/eleven";

interface AiCommunitySectionProps {
  /**
   * "standalone" 渲染完整的 section（自带背景/间距/AI社群 抬头与探索详情
   * CTA）。"embedded" 只渲染视觉+手风琴部分，供调用方套进自己的 section
   * 与标题里——用于 /ai 页「社群包含什么」板块，避免和页面自身的抬头/CTA
   * 重复。
   */
  variant?: "standalone" | "embedded";
}

export function AiCommunitySection({ variant = "standalone" }: AiCommunitySectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  // 左侧图片跟着"最近一次展开"的维度走，收起某一项时不清空图片——避免
  // 折叠到全部收起时左侧突然变空白。
  const [activeIndex, setActiveIndex] = useState(0);
  const activeVisual = features[activeIndex].visual;

  const content = (
    <div className="grid gap-6 md:h-[480px] md:grid-cols-2 md:items-stretch">
      <div
        aria-hidden="true"
        className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#efefef] md:aspect-auto ${
          activeVisual.type === "image" ? "bg-[#050a18]" : "bg-[#fdfcfc]"
        }`}
      >
        {activeVisual.type === "particle" ? (
          <ParticleField key={activeIndex} mode={activeVisual.mode} className="fade-in" />
        ) : activeVisual.type === "flag" ? (
          <FlagVisual key={activeIndex} className="fade-in" background="#fdfcfc" />
        ) : activeVisual.type === "ring-sphere-dot-matrix" ? (
          <RingSphereDotMatrix key={activeIndex} className="fade-in" background="#fdfcfc" />
        ) : activeVisual.type === "tool-dot-matrix" ? (
          <ToolDotMatrix key={activeIndex} className="fade-in" background="#fdfcfc" />
        ) : activeVisual.type === "sphere-connect-dot-matrix" ? (
          <SphereConnectDotMatrix key={activeIndex} className="fade-in" background="#fdfcfc" />
        ) : activeVisual.type === "navigator-dot-matrix" ? (
          <NavigatorDotMatrix key={activeIndex} className="fade-in" background="#fdfcfc" />
        ) : activeVisual.type === "salon-dot-matrix" ? (
          <SalonDotMatrix key={activeIndex} className="fade-in" background="#fdfcfc" />
        ) : (
          <Image
            key={activeIndex}
            src={activeVisual.src}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="fade-in object-cover"
          />
        )}
      </div>
      <div className="border-t border-[#efefef] md:min-h-0 md:overflow-y-auto">
        {features.map((feature, index) => {
          const isOpen = openIndex === index;
          const panelId = `ai-community-panel-${index}`;
          const triggerId = `ai-community-trigger-${index}`;

          return (
            <div key={feature.label} className="border-b border-[#efefef]">
              <button
                id={triggerId}
                type="button"
                className="flex w-full items-center justify-between gap-6 py-5 text-left"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => {
                  if (isOpen) {
                    setOpenIndex(null);
                  } else {
                    setOpenIndex(index);
                    setActiveIndex(index);
                  }
                }}
              >
                <span className="text-[18px] leading-[1.3] font-medium text-[#1c1917]">
                  {feature.label}
                </span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#efefef] text-[#1c1917]">
                  {isOpen ? (
                    <MinusIcon aria-hidden="true" className="size-3.5" />
                  ) : (
                    <PlusIcon aria-hidden="true" className="size-3.5" />
                  )}
                </span>
              </button>
              <div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                hidden={!isOpen}
                className="pb-5 pr-10"
              >
                <p className="text-[14px] leading-[1.65] text-[#57534e]">
                  {feature.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (variant === "embedded") {
    return content;
  }

  return (
    <section id="ai" className="bg-[#fdfcfc] py-24">
      <div className={ePageContainer}>
        <div className="reveal mb-14">
          <p className={eEyebrow}>AI社群</p>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[40px]">
            保持对行业前沿的持续感知
          </h2>
          <p className="mt-3 max-w-[540px] text-[16px] leading-[1.65] text-[#57534e]">
            每日更新前沿 AI 资讯与工具测评，持续补充你对行业变化的感知力。
          </p>
          <Link href="/ai" className={`${eBtnGhost} mt-8 gap-1.5`}>
            探索详情
            <ArrowRightIcon className="size-4" strokeWidth={1.6} />
          </Link>
        </div>

        {content}
      </div>
    </section>
  );
}
