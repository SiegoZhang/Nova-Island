"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

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

interface DeckContextValue {
  register: (el: HTMLElement) => () => void;
  scrollToIndex: (index: number) => void;
  activeIndex: number;
  count: number;
}

const DeckContext = createContext<DeckContextValue | null>(null);

export function useSlideDeck(): DeckContextValue {
  const ctx = useContext(DeckContext);
  if (!ctx) throw new Error("useSlideDeck must be used inside <SlideDeck>");
  return ctx;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SlideDeck({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLElement[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState(0);

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
  }, []);

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

  return (
    <DeckContext.Provider value={{ register, scrollToIndex, activeIndex, count }}>
      <div
        ref={scrollerRef}
        data-slide-deck
        className="relative h-[100svh] w-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-none scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

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
  rails = false,
}: {
  children: ReactNode;
  className?: string;
  /** 在 1280px 内容列两侧画贯穿该屏的竖向发丝线（仅桌面），复刻原
   *  GridRails 的分割竖线。深色的 Hero / Contact 屏不需要。 */
  rails?: boolean;
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
      {rails && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 hidden md:block"
        >
          <div className="relative mx-auto h-full w-full max-w-[1280px]">
            <span className="absolute inset-y-0 left-0 w-px bg-white/10" />
            <span className="absolute inset-y-0 right-0 w-px bg-white/10" />
          </div>
        </div>
      )}
      {children}
    </section>
  );
}
