"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { AiFdeParticleMorph } from "@/components/AiFdeParticleMorph";
import { prefersReducedMotion } from "@/lib/dotSystem/runtime";

// 首页「幻灯片」容器：每一屏占满视口，滚轮/触屏在屏之间吸附切换，配键盘
// 翻页、右侧圆点导航、顶部进度条。不劫持 wheel —— 用原生 CSS scroll-snap
// （mandatory + scroll-snap-stop: always），这样 AI社群 / FDE / 团队 三个
// 区块自带的「区块内滚轮切卡」二级交互能天然叠加：用户在区块内时它们
// preventDefault 切卡，切到首/尾再放行，容器才吸附到下一屏。
//
// 每帧把「当前屏中心相对视口中心的偏移」写成 CSS 变量 --rel 挂在每个
// [data-slide] 上（-1 上一屏 … 0 居中 … 1 下一屏），供 [data-parallax]
// 子元素做轻微纵向视差；[data-active] 标记当前屏，globals.css 里据此让
// 区块内已有的 .reveal / .reveal-atom 入场动画「滚到才播放」。

/** AI社群 → FDE 翻页粒子形变过渡用：两屏各自把「粒子落点参照元素」注册进来
 *  （AI 的人形渲染区、FDE 的点阵地球容器），粒子层据此取屏幕矩形。 */
export type MorphAnchorKey = "ai" | "fde";

export interface DeckTransitionState {
  /** 滚动位置算出的进度 0..1（AI→FDE），只用来给粒子层定方向。 */
  t: number;
  /** AI 屏相对其吸附位已滚过的像素（≥0）：把 AI 锚点屏幕 Y 加上它 →
   *  AI 吸附时的「定格」屏幕位置。 */
  aShiftPx: number;
  /** FDE 屏相对其吸附位的像素偏移（≤0，FDE 还在下方）：同理加到 FDE 锚点 Y。 */
  bShiftPx: number;
  /** 粒子层正在跑自己的慢时间线：此时 --ai-fde-t 由粒子层写；否则由
   *  SlideDeck 按滚动位置写（保证静止停在某屏时该屏内容一定可见）。 */
  particleEngaged: boolean;
}

interface DeckContextValue {
  register: (el: HTMLElement) => () => void;
  scrollToIndex: (index: number) => void;
  activeIndex: number;
  count: number;
  /** 过渡状态，每帧写在这个 ref 上，供粒子层的 rAF 直接读，不触发 React 重渲染。 */
  transitionRef: MutableRefObject<DeckTransitionState>;
  registerMorphAnchor: (key: MorphAnchorKey, el: HTMLElement | null) => void;
  morphAnchorsRef: MutableRefObject<Record<MorphAnchorKey, HTMLElement | null>>;
}

const DeckContext = createContext<DeckContextValue | null>(null);

export function useSlideDeck(): DeckContextValue {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error("useSlideDeck must be used inside <SlideDeck>");
  return ctx;
}

/** SlideDeck 外复用相关组件时也能安全调用——不在 deck 里就返回 null。 */
export function useSlideDeckOptional(): DeckContextValue | null {
  return useContext(DeckContext);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const EMPTY_SUBSCRIBE = () => () => {};

export function SlideDeck({
  children,
  /** 传入某屏 index，则在该屏 → 下一屏之间启用粒子形变过渡（当前仅
   *  AI社群→FDE，index 2）。不传 = 关闭。 */
  morphBoundaryIndex,
}: {
  children: ReactNode;
  morphBoundaryIndex?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLElement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState(0);

  const transitionRef = useRef<DeckTransitionState>({
    t: 0,
    aShiftPx: 0,
    bShiftPx: 0,
    particleEngaged: false,
  });
  const morphAnchorsRef = useRef<Record<MorphAnchorKey, HTMLElement | null>>({
    ai: null,
    fde: null,
  });
  const registerMorphAnchor = useCallback(
    (key: MorphAnchorKey, el: HTMLElement | null) => {
      morphAnchorsRef.current[key] = el;
    },
    [],
  );

  // 粒子层是否挂载：只在客户端、非 reduced-motion、桌面精确指针下开。
  // useSyncExternalStore：SSR 快照恒 false，客户端再算真值，无 hydration 冲突。
  const morphEnabled = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    () =>
      morphBoundaryIndex != null &&
      !prefersReducedMotion() &&
      window.matchMedia("(min-width: 768px) and (pointer: fine)").matches,
    () => false,
  );

  const register = useCallback((el: HTMLElement) => {
    const list = slidesRef.current;
    if (!list.includes(el)) {
      list.push(el);
      list.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      setCount(list.length);
    }
    return () => {
      slidesRef.current = slidesRef.current.filter((s) => s !== el);
      setCount(slidesRef.current.length);
    };
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const scroller = scrollerRef.current;
    const el = slidesRef.current[index];
    if (!scroller || !el) return;
    scroller.scrollTo({ top: el.offsetTop, behavior: "smooth" });
  }, []);

  // 滚动时每帧更新：当前屏、进度条、每个屏的 --rel 视差量。
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let raf = 0;
    let queued = false;

    const update = () => {
      queued = false;
      const vh = scroller.clientHeight;
      if (vh <= 0) return;
      const viewCenter = scroller.scrollTop + vh / 2;

      let best = 0;
      let bestDist = Infinity;
      slidesRef.current.forEach((el, i) => {
        const center = el.offsetTop + el.offsetHeight / 2;
        const rel = clamp((center - viewCenter) / vh, -1, 1);
        el.style.setProperty("--rel", rel.toFixed(3));
        const dist = Math.abs(center - viewCenter);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });

      const max = scroller.scrollHeight - scroller.clientHeight;
      setProgress(max > 0 ? clamp(scroller.scrollTop / max, 0, 1) : 0);
      setActiveIndex((prev) => (prev === best ? prev : best));

      // AI社群 → FDE 过渡进度：从 morphBoundaryIndex 屏的吸附位滚到下一屏
      // 吸附位之间的 0..1，写进 ref（粒子层 rAF 读）+ CSS 变量（两屏淡入淡出）。
      if (morphBoundaryIndex != null) {
        const a = slidesRef.current[morphBoundaryIndex];
        const b = slidesRef.current[morphBoundaryIndex + 1];
        let t = 0;
        let aShiftPx = 0;
        let bShiftPx = 0;
        if (a && b && b.offsetTop > a.offsetTop) {
          t = clamp((scroller.scrollTop - a.offsetTop) / (b.offsetTop - a.offsetTop), 0, 1);
          aShiftPx = scroller.scrollTop - a.offsetTop;
          bShiftPx = scroller.scrollTop - b.offsetTop;
        }
        transitionRef.current.t = t;
        transitionRef.current.aShiftPx = aShiftPx;
        transitionRef.current.bShiftPx = bShiftPx;
        // 粒子层正在跑它的慢时间线时，--ai-fde-t 归它写；否则（静止停在
        // 某屏、或根本没挂粒子层）由这里按滚动位置写，保证该屏内容可见。
        if (!transitionRef.current.particleEngaged) {
          document.documentElement.style.setProperty("--ai-fde-t", t.toFixed(4));
        }
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      raf = requestAnimationFrame(update);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scroller);
    update();

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [morphBoundaryIndex]);

  // 键盘翻页：↑↓ / PageUp/PageDown / Home / End。输入框内不拦截。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const last = slidesRef.current.length - 1;
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        scrollToIndex(Math.min(activeIndex + 1, last));
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        scrollToIndex(Math.max(activeIndex - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        scrollToIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        scrollToIndex(last);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, scrollToIndex]);

  // 带 hash 进来（/#team 等）时，滚动容器初始 scrollTop 为 0，浏览器原生
  // 锚点定位在嵌套滚动容器里不可靠——挂载后手动定位一次。
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    const target = document.getElementById(id);
    const scroller = scrollerRef.current;
    if (!target || !scroller) return;
    const top =
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTo({ top, behavior: "auto" });
  }, []);

  // progress 每帧变 → SlideDeck 每帧重渲染；context value 用 useMemo 稳住，
  // 只在 activeIndex / count 变化时才换新引用，避免消费方每帧跟着重渲染。
  const contextValue = useMemo<DeckContextValue>(
    () => ({
      register,
      scrollToIndex,
      activeIndex,
      count,
      transitionRef,
      registerMorphAnchor,
      morphAnchorsRef,
    }),
    [register, scrollToIndex, activeIndex, count, registerMorphAnchor],
  );

  return (
    <DeckContext.Provider value={contextValue}>
      <div
        ref={scrollerRef}
        data-slide-deck
        className="relative h-[100svh] w-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-none scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {morphEnabled && (
        <AiFdeParticleMorph transitionRef={transitionRef} morphAnchorsRef={morphAnchorsRef} />
      )}

      {/* 顶部进度条 —— mix-blend-difference 让它在深色/浅色屏上都可见。 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 h-px mix-blend-difference"
      >
        <div
          className="h-full bg-white transition-[width] duration-150 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <DeckDots activeIndex={activeIndex} count={count} onSelect={scrollToIndex} />

      {activeIndex === 0 && count > 1 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center mix-blend-difference"
        >
          <span className="flex h-8 w-5 items-start justify-center rounded-full border border-white/70 pt-1.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
          </span>
        </div>
      )}
    </DeckContext.Provider>
  );
}

function DeckDots({
  activeIndex,
  count,
  onSelect,
}: {
  activeIndex: number;
  count: number;
  onSelect: (index: number) => void;
}) {
  if (count <= 1) return null;
  return (
    <nav
      aria-label="页面分屏导航"
      className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-3 mix-blend-difference md:flex"
    >
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`第 ${i + 1} 屏`}
          aria-current={i === activeIndex ? "true" : undefined}
          onClick={() => onSelect(i)}
          className="flex size-4 items-center justify-center"
        >
          <span
            className={`rounded-full bg-white transition-all duration-300 ${
              i === activeIndex ? "size-2.5" : "size-1.5 opacity-50"
            }`}
          />
        </button>
      ))}
    </nav>
  );
}

export function Slide({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const { register } = useSlideDeck();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unregister = register(el);
    const root = el.closest("[data-slide-deck]");
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.intersectionRatio >= 0.55),
      { root, threshold: [0, 0.55, 1] },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      unregister();
    };
  }, [register]);

  return (
    <section
      ref={ref}
      data-slide
      data-active={active || undefined}
      className={`relative flex h-[100svh] w-full snap-start snap-always flex-col justify-center overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        className ?? ""
      }`}
    >
      {children}
    </section>
  );
}
