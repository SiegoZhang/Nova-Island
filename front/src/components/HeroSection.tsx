"use client";

import { useEffect } from "react";

import { HeroCtas } from "@/components/HeroCtas";
import { HeroFlowField } from "@/components/HeroFlowField";
import { useHeroTheme } from "@/lib/heroTheme";

// Hero 现在只有两样东西：一整块「流动等高线」背景（<HeroFlowField>，全屏
// GLSL 片元着色器，见该文件注释）和居中的文案 + CTA。之前那套「日出视频
// 点阵 / 点阵地球 + 水波」双效果连同 400 行开发调参面板已整体移除。
//
// 背景是深色，导航栏/网格竖线的状态是固定的：hero 非浅底、隐藏竖线，
// 只在挂载时通知一次。文案整套是浅色系，CTA 走 light={false}（白色系按钮）。

// 文案 + 背景同时起步、同时渐出，用同一个时长做 reveal 动画。
const HERO_ENTRANCE_DURATION_MS = 700;

export function HeroSection() {
  const { setIsHeroLight, setHideHeroRails } = useHeroTheme();

  useEffect(() => {
    setIsHeroLight(true);
    setHideHeroRails(true);
  }, [setIsHeroLight, setHideHeroRails]);

  return (
    <section id="hero" className="relative h-[100svh] w-full">
      <div className="relative flex h-full w-full items-start justify-center overflow-hidden bg-black">
        <HeroFlowField />

        <div
          data-parallax
          className="relative flex flex-col items-center px-6 pt-[24vh] text-center"
        >
          <div className="flex flex-col items-center">
            <p
              className="reveal text-[15px] font-medium text-white/55"
              style={{ animationDuration: `${HERO_ENTRANCE_DURATION_MS}ms` }}
            >
              让 AI 从认知走向价值
            </p>

            <h1
              className="reveal mt-5 bg-gradient-to-r from-[#d9d9d9] to-white bg-clip-text text-[clamp(56px,11vw,84px)] font-semibold leading-[1.05] tracking-[-0.03em] text-transparent"
              style={{ animationDuration: `${HERO_ENTRANCE_DURATION_MS}ms` }}
            >
              新岛
            </h1>

            <p
              className="reveal mt-8 max-w-[600px] text-[18px] leading-[1.6] text-white/75"
              style={{ animationDuration: `${HERO_ENTRANCE_DURATION_MS}ms` }}
            >
              专注于人工智能领域的知识服务与工程落地，以AI社群保持认知领先，以FDE驱动工程落地。
            </p>

            <HeroCtas
              light={false}
              revealDurationMs={HERO_ENTRANCE_DURATION_MS}
              revealDelayMs={0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
