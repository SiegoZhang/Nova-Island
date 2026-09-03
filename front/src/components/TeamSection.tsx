"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CardBreadcrumb } from "@/components/CardBreadcrumb";
import { CtaButton } from "@/components/CtaButton";
import {
  CommitSlider,
  persistDotTuningValue,
  TuningPanelShell,
} from "@/components/dotSystemTuningControls";
import { ImageDotMatrix } from "@/components/ImageDotMatrix";
import { eEyebrowDark, ePageContainer } from "@/lib/eleven";

// "工程师文化"卡片背景纹理：assets/computer.png（透明背景抠图）用
// ImageDotMatrix 实时采样成点阵，颜色统一 d0d0d0（跟 AI社群 点阵一致）。密度/点径/位置/大小
// 不写死，配一个仅开发环境可见的调参面板，松手后通过 persistDotTuningValue
// 写回下面这个 TEAM_ENGINEER_DOT_DEFAULTS，不需要手动把面板数字抄回源码。
const TEAM_ENGINEER_DOT_DEFAULTS = {
  src: "/images/team-engineer-source.png",
  cellPx: 6,
  // 半径用绝对 css px（不随 cellPx 缩放）——密度和点径是两个独立维度，
  // 改密度不该顺带把点也跟着放大/缩小，调参面板里两个滑块才不会打架。
  minRadiusPx: 1.1,
  maxRadiusPx: 11.9,
  rightShiftPercent: 20,
  downShiftPercent: 0,
  sizePercent: 86,
} as const;

// "扎根一线"卡片背景纹理：assets/compass.png（指南针 + 望远镜，透明背景
// 抠图，已裁掉四周多余的透明留白）同一套处理，颜色同样用 d0d0d0。
const TEAM_COMPASS_DOT_DEFAULTS = {
  src: "/images/team-compass-source.png",
  cellPx: 8,
  minRadiusPx: 1.1,
  maxRadiusPx: 14,
  rightShiftPercent: 22,
  downShiftPercent: 0,
  sizePercent: 56,
} as const;

// "长期陪跑"卡片背景纹理：assets/sand clock.png（透明背景抠图，已裁掉
// 四周多余的透明留白）同一套处理，颜色同样用 d0d0d0，跟工程师卡片视觉
// 语言保持一致。
const TEAM_CLOCK_DOT_DEFAULTS = {
  src: "/images/team-clock-source.png",
  cellPx: 6,
  minRadiusPx: 1.1,
  maxRadiusPx: 4.5,
  rightShiftPercent: 31,
  downShiftPercent: 0,
  sizePercent: 85,
} as const;

// "持续学习"卡片背景纹理：assets/book1.png（摊开的书，透明背景抠图，已
// 裁掉四周多余的透明留白）同一套处理，颜色同样用 d0d0d0。素材跟之前的
// book.png 构图差很多（更宽更扁），位置/大小先还原成安全默认值，实际
// 效果用调参面板重新调。
const TEAM_BOOK_DOT_DEFAULTS = {
  src: "/images/team-book-source.png",
  cellPx: 9,
  minRadiusPx: 1.1,
  maxRadiusPx: 7.3,
  rightShiftPercent: 19,
  downShiftPercent: 10,
  sizePercent: 59,
} as const;

interface TeamCardDotTextureProps {
  componentId: string;
  panelTitle: string;
  defaults: {
    src: string;
    cellPx: number;
    minRadiusPx: number;
    maxRadiusPx: number;
    rightShiftPercent: number;
    downShiftPercent: number;
    sizePercent: number;
  };
}

// 两张卡片（工程师文化/长期陪跑）共用同一套"点阵背景纹理 + 仅开发环境
// 可见的调参面板"逻辑，抽成这个子组件，避免每加一张卡片就复制一遍五个
// state + 一整块面板 JSX。面板松手后通过 persistDotTuningValue 写回调用方
// 传入的 defaults 所在的那个 *_DOT_DEFAULTS 常量（componentId 对应
// api/dev/dot-tuning 白名单里的条目）。
function TeamCardDotTexture({ componentId, panelTitle, defaults }: TeamCardDotTextureProps) {
  const [cellPx, setCellPx] = useState(defaults.cellPx);
  const [maxRadiusPx, setMaxRadiusPx] = useState(defaults.maxRadiusPx);
  const [rightShiftPercent, setRightShiftPercent] = useState(defaults.rightShiftPercent);
  const [downShiftPercent, setDownShiftPercent] = useState(defaults.downShiftPercent);
  const [sizePercent, setSizePercent] = useState(defaults.sizePercent);

  return (
    <>
      {/* 靠左侧做遮罩淡出，避免压住左对齐的文字块；位置/大小靠内层
          transform 独立控制，跟密度/点径一起给调参面板调。 */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 42%)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 42%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translateX(${rightShiftPercent}%) translateY(${downShiftPercent}%) scale(${sizePercent / 100})`,
          }}
        >
          <ImageDotMatrix
            src={defaults.src}
            cellPx={cellPx}
            minRadiusPx={defaults.minRadiusPx}
            maxRadiusPx={maxRadiusPx}
            color="#4a4a4a"
            mouseInteraction
          />
        </div>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <TuningPanelShell title={panelTitle} positionClassName="right-2 top-2">
          <CommitSlider
            label="密度"
            value={cellPx}
            min={4}
            max={28}
            step={1}
            unit="px"
            onCommit={(v) => {
              setCellPx(v);
              persistDotTuningValue(componentId, "cellPx", v);
            }}
          />
          <CommitSlider
            label="点径"
            value={maxRadiusPx}
            min={1}
            max={14}
            step={0.1}
            unit="px"
            onCommit={(v) => {
              setMaxRadiusPx(v);
              persistDotTuningValue(componentId, "maxRadiusPx", v);
            }}
          />
          <CommitSlider
            label="右移"
            value={rightShiftPercent}
            min={-40}
            max={40}
            step={1}
            unit="%"
            onCommit={(v) => {
              setRightShiftPercent(v);
              persistDotTuningValue(componentId, "rightShiftPercent", v);
            }}
          />
          <CommitSlider
            label="下移"
            value={downShiftPercent}
            min={-40}
            max={40}
            step={1}
            unit="%"
            onCommit={(v) => {
              setDownShiftPercent(v);
              persistDotTuningValue(componentId, "downShiftPercent", v);
            }}
          />
          <CommitSlider
            label="大小"
            value={sizePercent}
            min={50}
            max={200}
            step={1}
            unit="%"
            onCommit={(v) => {
              setSizePercent(v);
              persistDotTuningValue(componentId, "sizePercent", v);
            }}
          />
        </TuningPanelShell>
      )}
    </>
  );
}

const values = [
  {
    title: "工程师文化",
    description: "用代码而非 PPT 验证价值，以第一性原理拆解每一个业务问题。",
  },
  {
    title: "扎根一线",
    description: "深入客户真实业务场景交付，而不是隔着一层需求文档遥控。",
  },
  {
    title: "长期陪跑",
    description: "交付只是起点，我们更看重与客户共同成长的长期合作关系。",
  },
  {
    title: "持续学习",
    description: "对前沿技术保持敏感，把最新能力快速转化为可复用的交付经验。",
  },
] as const;

const SLIDE_DURATION_MS = 700;
const WHEEL_SWITCH_THRESHOLD = 3;
const WHEEL_GESTURE_IDLE_MS = 140;

type SlideDirection = "up" | "down";

export function TeamSection() {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("up");
  const cardRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const cleanupPrevRef = useRef<number | null>(null);
  const wheelIdleTimeoutRef = useRef<number | null>(null);

  const showCard = useCallback((index: number, direction: SlideDirection) => {
    if (index === currentRef.current) return;

    if (cleanupPrevRef.current !== null) {
      window.clearTimeout(cleanupPrevRef.current);
    }

    setPrev(currentRef.current);
    setSlideDirection(direction);
    setCurrent(index);
    currentRef.current = index;

    cleanupPrevRef.current = window.setTimeout(() => {
      setPrev(null);
      cleanupPrevRef.current = null;
    }, SLIDE_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (cleanupPrevRef.current !== null) {
        window.clearTimeout(cleanupPrevRef.current);
      }
      if (wheelIdleTimeoutRef.current !== null) {
        window.clearTimeout(wheelIdleTimeoutRef.current);
      }
    };
  }, []);

  const showAdjacentCard = useCallback(
    (direction: SlideDirection) => {
      const next =
        direction === "up"
          ? (currentRef.current + 1) % values.length
          : (currentRef.current - 1 + values.length) % values.length;

      showCard(next, direction);
    },
    [showCard],
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const normalizeDeltaY = (event: WheelEvent) => {
      if (event.deltaMode === 1) return event.deltaY * 16;
      if (event.deltaMode === 2) return event.deltaY * card.clientHeight;
      return event.deltaY;
    };

    const handleWheel = (event: WheelEvent) => {
      const deltaY = normalizeDeltaY(event);
      const deltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      if (Math.abs(deltaY) <= Math.abs(deltaX) || Math.abs(deltaY) < WHEEL_SWITCH_THRESHOLD) return;

      event.preventDefault();

      if (wheelIdleTimeoutRef.current === null) {
        showAdjacentCard(deltaY > 0 ? "up" : "down");
      } else {
        window.clearTimeout(wheelIdleTimeoutRef.current);
      }

      wheelIdleTimeoutRef.current = window.setTimeout(() => {
        wheelIdleTimeoutRef.current = null;
      }, WHEEL_GESTURE_IDLE_MS);
    };

    card.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      card.removeEventListener("wheel", handleWheel);
      if (wheelIdleTimeoutRef.current !== null) {
        window.clearTimeout(wheelIdleTimeoutRef.current);
        wheelIdleTimeoutRef.current = null;
      }
    };
  }, [showAdjacentCard]);

  const goTo = (index: number) => {
    showCard(index, index > currentRef.current ? "up" : "down");
  };

  return (
    <section id="team" className="w-full">
      {/* 和 AI社群 / FDE 一致：本板块单独占满一个视口高度，内容整体垂直居中。 */}
      <div className={`${ePageContainer} grid min-h-[100svh] items-center gap-14 py-24 md:grid-cols-[40fr_60fr] md:gap-16`}>
        <div data-parallax className="reveal">
          <p data-title-reveal="1" className={eEyebrowDark}>我们的团队</p>
          <h2
            data-title-reveal="2"
            className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-[#f5f5f5] md:text-[40px]"
          >
            一支相信「亲自动手」的工程团队
          </h2>
          <p
            data-title-reveal="3"
            className="mt-4 max-w-[440px] text-[16px] leading-[1.65] text-[#a1a1aa]"
          >
            我们由长期扎根 AI
            工程化一线的工程师与研究者组成，团队规模不大，但每个人都直接对接客户场景与交付结果。
          </p>
          <CtaButton href="/contact" onDark size="md" className="mt-7">
            联系我们
          </CtaButton>
        </div>

        <div
          ref={cardRef}
          role="group"
          aria-label="团队价值卡片"
          // 卡片仍占右侧 60fr 一列，位置不变；桌面高度改由 16:9 长宽比决定，
          // 跟 AI社群 轮播卡在满宽下的比例保持一致。移动端沿用固定高度。
          className="reveal reveal-delay-1 relative h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#101012] md:h-auto md:aspect-[16/9]"
        >
          {values.map(({ title, description }, index) => {
            const isCurrent = index === current;
            const isPrev = index === prev;
            const isSliding = prev !== null && (isCurrent || isPrev);
            const parkedY = slideDirection === "up" ? "100%" : "-100%";
            const animationName = isCurrent
              ? `team-card-slide-in-${slideDirection}`
              : `team-card-slide-out-${slideDirection}`;

            const isEngineerCard = index === 0;
            const isCompassCard = index === 1;
            const isClockCard = index === 2;
            const isBookCard = index === 3;

            return (
              <div
                key={title}
                aria-hidden={!isCurrent}
                className="absolute inset-0 overflow-hidden bg-[#101012] p-8 will-change-transform md:p-12"
                style={{
                  animation: isSliding
                    ? `${animationName} ${SLIDE_DURATION_MS}ms cubic-bezier(0.65,0,0.35,1) both`
                    : "none",
                  transform: isCurrent ? "translate3d(0, 0, 0)" : `translate3d(0, ${parkedY}, 0)`,
                  opacity: isCurrent || isPrev ? 1 : 0,
                  zIndex: isCurrent ? 20 : isPrev ? 10 : 0,
                }}
              >
                {isEngineerCard && (
                  <TeamCardDotTexture
                    componentId="teamEngineer"
                    panelTitle="工程师卡片点阵调参（仅开发环境可见）"
                    defaults={TEAM_ENGINEER_DOT_DEFAULTS}
                  />
                )}
                {isCompassCard && (
                  <TeamCardDotTexture
                    componentId="teamCompass"
                    panelTitle="扎根一线卡片点阵调参（仅开发环境可见）"
                    defaults={TEAM_COMPASS_DOT_DEFAULTS}
                  />
                )}
                {isClockCard && (
                  <TeamCardDotTexture
                    componentId="teamClock"
                    panelTitle="陪跑卡片点阵调参（仅开发环境可见）"
                    defaults={TEAM_CLOCK_DOT_DEFAULTS}
                  />
                )}
                {isBookCard && (
                  <TeamCardDotTexture
                    componentId="teamBook"
                    panelTitle="学习卡片点阵调参（仅开发环境可见）"
                    defaults={TEAM_BOOK_DOT_DEFAULTS}
                  />
                )}
                <div className="relative flex h-full flex-col justify-center gap-4">
                  <div>
                    <p className="text-[18px] font-medium text-white md:text-[20px]">{title}</p>
                    <p className="mt-2 max-w-[420px] text-[15px] leading-[1.7] text-white/65 md:text-[16px]">
                      {description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          <CardBreadcrumb
            currentIndex={current}
            total={values.length}
            onSelect={goTo}
            tone="dark"
            className="absolute right-8 bottom-5 z-30 md:right-12"
          />
        </div>
      </div>
    </section>
  );
}
