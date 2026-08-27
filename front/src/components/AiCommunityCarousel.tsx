"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CardBreadcrumb } from "@/components/CardBreadcrumb";
import { ArrowRightIcon } from "@/components/icons";
import { FlagVisual } from "@/components/FlagVisual";
import { LazyMount } from "@/components/LazyMount";
import { NavigatorDotMatrix } from "@/components/NavigatorDotMatrix";
import { ParticleField } from "@/components/particle-field";
import { RingSphereDotMatrix } from "@/components/RingSphereDotMatrix";
import { SalonDotMatrix } from "@/components/SalonDotMatrix";
import { SphereConnectDotMatrix } from "@/components/SphereConnectDotMatrix";
import { ToolDotMatrix } from "@/components/ToolDotMatrix";
import { aiCommunityFeatures as features } from "@/lib/aiCommunityFeatures";
import { eBtnPrimary, eEyebrow, eRailContainer, ePageContainer } from "@/lib/eleven";

// Figma（node 169:4096）里的板块是一排大卡片轮播：容器裁切出一张完整
// 展开的当前卡（标题+文案+视觉+CTA），左右各露出一小截相邻卡片作为
// "还有更多"的提示。这里用原生横向 scroll-snap 还原同样的观感，不放
// 任何翻页按钮/圆点——只保留两种交互：悬浮区域滚动滚轮切卡（见下方
// wheel 监听），或者直接点击露出的相邻卡片区域滚动过去。
export function AiCommunityCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const wheelIdleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries.reduce<IntersectionObserverEntry | null>(
          (best, entry) =>
            entry.intersectionRatio > (best?.intersectionRatio ?? 0) ? entry : best,
          null,
        );
        if (mostVisible && mostVisible.intersectionRatio > 0) {
          const index = cardRefs.current.findIndex((el) => el === mostVisible.target);
          if (index !== -1) {
            activeIndexRef.current = index;
            setActiveIndex(index);
          }
        }
      },
      { root: track, threshold: [0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );

    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const goTo = (index: number) => {
    cardRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // 悬浮在轮播区域时，纵向滚轮手势切卡而不是滚动页面；横向手势（触控板
    // 双指横滑）保留原生横向滚动。一次滚轮手势只切一张卡——鼠标滚轮/
    // 触控板都会在一次手势里连续触发几十个 wheel 事件（尤其是带惯性/
    // 动量滚动的鼠标，一次滚动的事件流可能持续一秒以上），不能用固定
    // 时长的锁：锁定时长一旦短于事件流实际持续的时间，锁提前解开后，
    // 同一次物理滚动里后面的 wheel 事件会被当成"新的一次滚动"，导致
    // 一次滚动跳两张卡。这里改成空闲重置防抖——每来一个 wheel 事件就
    // 顺延解锁时间，只有事件流真正停下来一段时间后才解锁，不管这次
    // 滚动手势持续多久都只切一张卡。到达首尾卡片后不再拦截，把滚动
    // 交还给页面纵向滚动。
    const WHEEL_GESTURE_IDLE_MS = 200;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const direction = event.deltaY > 0 ? 1 : -1;
      const nextIndex = activeIndexRef.current + direction;
      if (nextIndex < 0 || nextIndex >= features.length) return;

      event.preventDefault();

      if (wheelIdleTimeoutRef.current === null) {
        goTo(nextIndex);
      } else {
        window.clearTimeout(wheelIdleTimeoutRef.current);
      }
      wheelIdleTimeoutRef.current = window.setTimeout(() => {
        wheelIdleTimeoutRef.current = null;
      }, WHEEL_GESTURE_IDLE_MS);
    };

    track.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      track.removeEventListener("wheel", handleWheel);
      if (wheelIdleTimeoutRef.current !== null) {
        window.clearTimeout(wheelIdleTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section id="ai" className="bg-[#F8F9FA] py-24">
      <div className={ePageContainer}>
        <div className="reveal mb-10 text-center">
          <p className={eEyebrow}>AI社群</p>
          <h2 className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[40px]">
            保持对行业前沿的持续感知
          </h2>
          <p className="mx-auto mt-3 max-w-[540px] text-[16px] leading-[1.65] text-[#57534e]">
            3000+ 行业先行者的选择，用最低成本保持对 AI 前沿的持续感知。
          </p>
        </div>
      </div>

      {/* 轮播轨道单独跳出 ePageContainer 的左右内边距，宽度直接贴到
          GridRails 画出的竖向分割线——卡片左右滑出/滑入时应该在分割线
          处被截断，而不是在分割线内侧留一圈空白再截断。左右各留一份
          ePageContainer 同款的内边距，只是为了让停在两端的卡片（第一张
          「每周风向」、最后一张「成为领航员」）跟分割线之间留出 36px
          间距，不影响中间卡片滑出时依然贴线截断——这份 padding 只在
          scrollLeft 到达两端极限时才会露出来，中途滚动不受影响。 */}
      <div className={eRailContainer}>
        <div
          ref={trackRef}
          className="reveal flex snap-x snap-mandatory gap-6 overflow-x-auto pl-6 pr-6 md:pl-9 md:pr-9 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {features.map((feature, index) => (
            <div
              key={feature.label}
              ref={(el) => {
                cardRefs.current[index] = el;
              }}
              onClick={index === activeIndex ? undefined : () => goTo(index)}
              className={`relative h-[420px] w-[82%] shrink-0 snap-center overflow-hidden rounded-2xl border border-[#efefef] bg-[#f3f6ed] sm:w-[68%] md:h-[560px] lg:w-[78%] ${
                index === activeIndex ? "" : "cursor-pointer"
              }`}
            >
              {/* 视觉层和文案层对每张卡都常驻渲染，不随 activeIndex 切换来
                  卸载/挂载——之前只给"当前卡"渲染真实内容、其余卡收缩成
                  一个纯文字按钮，滚动切卡时会因为组件挂载/卸载而闪一下，
                  两侧被收起的卡片文案也看不到。改成一直渲染同一份 DOM，
                  滚动只是把已经存在的卡片移进/移出视口。 */}
              <div
                aria-hidden="true"
                className={`absolute inset-0 ${
                  feature.visual.type === "image" ? "bg-[#050a18]" : "bg-[#f3f6ed]"
                }`}
              >
                {feature.visual.type === "particle" ? (
                  <ParticleField mode={feature.visual.mode} className="fade-in" />
                ) : feature.visual.type === "flag" ? (
                  <LazyMount>
                    <FlagVisual className="fade-in" background="#f3f6ed" />
                  </LazyMount>
                ) : feature.visual.type === "ring-sphere-dot-matrix" ? (
                  <LazyMount>
                    <RingSphereDotMatrix className="fade-in" background="#f3f6ed" />
                  </LazyMount>
                ) : feature.visual.type === "tool-dot-matrix" ? (
                  <LazyMount>
                    <ToolDotMatrix className="fade-in" background="#f3f6ed" />
                  </LazyMount>
                ) : feature.visual.type === "sphere-connect-dot-matrix" ? (
                  <LazyMount>
                    <SphereConnectDotMatrix className="fade-in" background="#f3f6ed" />
                  </LazyMount>
                ) : feature.visual.type === "navigator-dot-matrix" ? (
                  <LazyMount>
                    <NavigatorDotMatrix className="fade-in" background="#f3f6ed" />
                  </LazyMount>
                ) : feature.visual.type === "salon-dot-matrix" ? (
                  <LazyMount>
                    <SalonDotMatrix className="fade-in" background="#f3f6ed" />
                  </LazyMount>
                ) : (
                  <Image
                    src={feature.visual.src}
                    alt=""
                    fill
                    sizes="80vw"
                    className="fade-in object-cover"
                  />
                )}
              </div>
              <div
                className={`relative z-10 flex h-full max-w-[420px] flex-col justify-center gap-8 bg-gradient-to-r p-8 md:max-w-[480px] md:gap-10 md:p-14 ${
                  feature.visual.type === "image"
                    ? "from-[#050a18] via-[#050a18]/90 to-transparent"
                    : "from-[#f3f6ed] via-[#f3f6ed]/90 to-transparent"
                }`}
              >
                <div>
                  <h3
                    className={`text-[24px] leading-[1.3] font-semibold md:text-[32px] ${
                      feature.visual.type === "image" ? "text-white" : "text-[#111]"
                    }`}
                  >
                    {feature.label}
                  </h3>
                  <p
                    className={`mt-4 text-[15px] leading-[1.7] md:text-[16px] ${
                      feature.visual.type === "image" ? "text-white/75" : "text-[#4f5150]"
                    }`}
                  >
                    {feature.description}
                  </p>
                </div>
                <Link href="/ai" className={`${eBtnPrimary} w-fit gap-1.5`}>
                  探索详情
                  <ArrowRightIcon className="size-4" strokeWidth={1.6} />
                </Link>
              </div>
              <CardBreadcrumb
                currentIndex={activeIndex}
                total={features.length}
                onSelect={goTo}
                tone={feature.visual.type === "image" ? "dark" : "light"}
                className="absolute right-8 bottom-8 z-20 md:right-14 md:bottom-14"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
