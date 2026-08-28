"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronDownIcon } from "@/components/icons";
import { LazyMount } from "@/components/LazyMount";
import { NavigatorDotMatrix } from "@/components/NavigatorDotMatrix";
import {
  aiCommunityFeatures as features,
  type AiCommunityDimensions,
} from "@/lib/aiCommunityFeatures";
import { eMono } from "@/lib/eleven";

// Figma node 217:13「spectral-analysis-dashboard」——AI 社群板块整体做成一台
// 光谱分析仪的读数界面：
//   · 左列（telemetry）：AI社群标题 + 简介 + 「了解详情」，滚动时保持不变。
//   · 中间（target-coordinate-area）：始终是「成为领航员」那尊点阵人像
//     （NavigatorDotMatrix），外面套一实一虚两个方框 + 同心圆 + 十字线 +
//     LAMBDA 轴。鼠标悬浮时两个方框错位交叠、人像上浮现一小片红/蓝/琥珀
//     像素。滚轮不切换中间元素。
//   · 右列：NN/06 编号 + 维度名 + 描述 + 四维雷达图（交流 / 收获 / 提升 /
//     前沿），随滚轮或上下按钮在 6 个维度之间切换。
//
// 交互：悬浮在仪表盘上纵向滚轮切换右侧维度，一次手势切一格（空闲重置
// 防抖，跟 TeamSection/FdeSection 同一套），到首尾不再拦截，把滚动交还
// 给 SlideDeck 翻屏。

// 中间人像上悬浮浮现的像素色块：12×12 网格，按到中心的距离分层上色——
// 白核 → 琥珀环 → 红/蓝交错外圈，再抽稀约 1/3 形成散点而不是实心圆斑。
// 渲染成一层覆盖在 NavigatorDotMatrix 上、默认透明、group-hover 时按距离
// 错峰淡入的方块。
const HOVER_PIXELS: { color: string; delay: number }[] = (() => {
  const cells: { color: string; delay: number }[] = [];
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 12; c++) {
      const dx = c - 5.5;
      const dy = r - 5.5;
      const d = Math.hypot(dx, dy);
      let color = "";
      if (d <= 1.7) color = "#ffffff";
      else if (d <= 3.1) color = "#f59e0b";
      else if (d <= 5) color = (r + c) % 2 === 0 ? "#dc2626" : "#1d4ed8";
      if (color && (r * 7 + c * 3) % 3 === 0) color = "";
      cells.push({ color, delay: color ? Math.round(d * 45) : 0 });
    }
  }
  return cells;
})();

const WHEEL_GESTURE_IDLE_MS = 200;

export function AiCommunityCarousel() {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const wheelIdleRef = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    if (next < 0 || next >= features.length || next === activeRef.current) return;
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
      if (next < 0 || next >= features.length) return; // 首尾放行 → SlideDeck 翻屏

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

  const feature = features[active];

  return (
    <section id="ai" className="w-full">
      <div
        ref={rootRef}
        className="relative mx-auto flex min-h-[100svh] w-full max-w-[1440px] flex-col overflow-hidden md:h-[100svh]"
      >
        <div className="relative z-10 flex flex-1 flex-col gap-14 px-6 py-24 md:grid md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(280px,340px)] md:items-center md:gap-8 md:px-12 md:py-0">
          {/* ── 左列 telemetry ── */}
          <div className="reveal flex flex-col gap-7">
            <div>
              <p className={`${eMono} text-[32px] font-bold leading-tight text-[#f3f4f6]`}>AI社群</p>
              <p className={`${eMono} mt-1.5 text-[12px] text-[#9ca3af]`}>新岛AI</p>
            </div>
            <div>
              <p className={`${eMono} text-[9px] uppercase tracking-[0.15em] text-[#4b5563]`}>Intro</p>
              <p className={`${eMono} mt-2 text-[11px] leading-[1.75] text-[#9ca3af]`}>
                3000+ 行业先行者的选择，用最低成本保持对 AI 前沿的持续感知。每日精选全球顶尖 AI
                研究、产品动态与实战案例，帮助你快速掌握技术趋势，将 AI
                能力转化为实际生产力。无论你是开发者、创业者还是企业决策者，这里都是你连接 AI
                未来的第一入口。
              </p>
            </div>
            <Link
              href="/ai"
              className={`${eMono} inline-flex w-fit items-center rounded-[4px] border border-[#9ca3af] bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#070709] transition-colors hover:bg-[#e5e7eb]`}
            >
              了解详情
            </Link>
          </div>

          {/* ── 中间 target-coordinate-area ── */}
          <div
            data-parallax
            className="reveal group relative mx-auto aspect-square w-[min(88vw,520px)] md:w-[min(60vh,600px)]"
          >
            {/* 外圈大圆 + 十字线 */}
            <div className="absolute inset-[6%] rounded-full border border-white/10" />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />
            {/* 左右边缘的小十字标记（Figma 参考图里那两个 +） */}
            <span
              className={`${eMono} absolute top-1/2 -left-[4%] -translate-y-1/2 text-[12px] text-white/25`}
            >
              +
            </span>
            <span
              className={`${eMono} absolute top-1/2 -right-[4%] -translate-y-1/2 text-[12px] text-white/25`}
            >
              +
            </span>
            {/* 上 / 下刻度条 */}
            <div className="absolute left-1/2 top-[3%] h-6 w-1.5 -translate-x-1/2 rounded-full bg-[#f3f4f6]" />
            <div className="absolute bottom-[3%] left-1/2 h-6 w-1.5 -translate-x-1/2 rounded-full bg-[#f3f4f6]" />

            {/* 实线方框 A —— 悬浮时向左下错位并轻微逆时针旋转 */}
            <div className="absolute inset-[18%] border border-[#9ca3af]/55 transition-transform duration-500 ease-out group-hover:-translate-x-[6%] group-hover:translate-y-[5%] group-hover:-rotate-2" />
            {/* 虚线方框 B —— 默认右上错位，悬浮时错得更开并顺时针旋转 */}
            <div className="absolute inset-[18%] -translate-y-[10%] translate-x-[13%] border border-dashed border-[#9ca3af]/55 transition-transform duration-500 ease-out group-hover:-translate-y-[17%] group-hover:translate-x-[23%] group-hover:rotate-2">
              <span
                className={`${eMono} absolute right-1.5 top-1.5 bg-[#f3f4f6] px-1.5 py-0.5 text-[9px] font-bold text-[#070709]`}
              >
                Found
              </span>
            </div>

            {/* 内同心圆 */}
            <div className="absolute inset-[27%] rounded-full border border-white/[0.06]" />

            {/* 点阵人像（常驻，不随滚动切换）。放大铺满整个 target 区、
                居中（rightShiftPercent=0）、内部再放大到 120%；hoverColor
                让光标附近的粒子染成琥珀色。 */}
            <div className="absolute inset-[-2%] overflow-hidden">
              <LazyMount>
                <NavigatorDotMatrix
                  className="fade-in"
                  background="#000000"
                  hoverColor="#f59e0b"
                  sizePercent={120}
                  rightShiftPercent={0}
                />
              </LazyMount>
            </div>

            {/* 悬浮时按距离错峰淡入的彩色像素层 */}
            <div className="pointer-events-none absolute inset-[12%] grid grid-cols-12 grid-rows-12">
              {HOVER_PIXELS.map((px, i) =>
                px.color ? (
                  <span
                    key={i}
                    className="opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-90 motion-reduce:transition-none"
                    style={{ backgroundColor: px.color, transitionDelay: `${px.delay}ms` }}
                  />
                ) : (
                  <span key={i} />
                ),
              )}
            </div>

            {/* LAMBDA 轴 */}
            <div
              className={`${eMono} absolute -bottom-9 left-0 flex w-full items-center justify-between px-[13%] text-[10px] text-[#9ca3af]`}
            >
              <span>0.1</span>
              <span>1.0</span>
              <span>10.0</span>
            </div>
            <p
              className={`${eMono} absolute -bottom-[54px] left-1/2 -translate-x-1/2 text-[8px] tracking-[0.15em] text-[#4b5563]`}
            >
              LAMBDA (um)
            </p>
          </div>

          {/* ── 右列：雷达图 + 读数 ── */}
          <div className="reveal flex flex-col items-end gap-9">
            <CommunityRadar dims={feature.dimensions} />
            <div key={active} className="fade-in flex w-full flex-col items-end text-right">
              <p className={`${eMono} text-[10px] text-[#9ca3af]`}>
                {String(active + 1).padStart(2, "0")}/{String(features.length).padStart(2, "0")}
              </p>
              <h3 className={`${eMono} mt-1 text-[22px] font-bold text-[#f3f4f6] md:text-[26px]`}>
                {feature.label}
              </h3>
              <p
                className={`${eMono} mt-5 max-w-[320px] text-[11px] leading-[1.8] text-[#9ca3af]`}
              >
                {feature.description}
              </p>
            </div>
          </div>
        </div>

        {/* 上 / 下切换按钮 */}
        <div className="absolute bottom-8 right-6 z-10 flex flex-col gap-1 md:bottom-[7%] md:right-[7%]">
          <button
            type="button"
            aria-label="上一个维度"
            onClick={() => go(active - 1)}
            disabled={active === 0}
            className="flex size-7 items-center justify-center rounded-[4px] border border-white/10 text-[#9ca3af] transition-colors hover:border-white/25 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="下一个维度"
            onClick={() => go(active + 1)}
            disabled={active === features.length - 1}
            className="flex size-7 items-center justify-center rounded-[4px] border border-white/10 text-[#9ca3af] transition-colors hover:border-white/25 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronDownIcon className="size-3" />
          </button>
        </div>
      </div>
    </section>
  );
}

// 四维雷达图：中心 50/50，四个顶点各沿一条半轴伸出（交流↑ / 收获→ /
// 提升↓ / 前沿←）。琥珀色数据区用 clip-path 多边形，配上四根轴向辐条和
// 顶点圆点——clip-path / height / width / top / left 全都能用纯 CSS 过渡，
// 切换维度时多边形平滑变形，不依赖任何动画库。
const RADAR_MAX = 45; // 顶点最远伸到盒子的 45%（留出到最外层菱形环的余量）

function CommunityRadar({ dims }: { dims: AiCommunityDimensions }) {
  const { exchange, gain, growth, frontier } = dims;
  const clip = `polygon(50% ${50 - RADAR_MAX * exchange}%, ${50 + RADAR_MAX * gain}% 50%, 50% ${
    50 + RADAR_MAX * growth
  }%, ${50 - RADAR_MAX * frontier}% 50%)`;

  const spoke = "absolute bg-[#f59e0b]/70 transition-[width,height] duration-500 ease-out";
  const dot =
    "absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f59e0b] transition-[top,left] duration-500 ease-out";

  return (
    <div className="relative size-[176px] shrink-0" aria-hidden="true">
      {/* 菱形网格环 */}
      {[1, 0.66, 0.33].map((s) => (
        <div
          key={s}
          className="absolute inset-0 border border-white/10"
          style={{ transform: `rotate(45deg) scale(${s})` }}
        />
      ))}
      {/* 十字线 */}
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />

      {/* 琥珀色数据区 */}
      <div
        className="absolute inset-0 bg-[#f59e0b]/20 transition-[clip-path] duration-500 ease-out"
        style={{ clipPath: clip, WebkitClipPath: clip }}
      />

      {/* 轴向辐条 */}
      <div
        className={`${spoke} bottom-1/2 left-1/2 w-px -translate-x-1/2`}
        style={{ height: `${RADAR_MAX * exchange}%` }}
      />
      <div
        className={`${spoke} left-1/2 top-1/2 h-px -translate-y-1/2`}
        style={{ width: `${RADAR_MAX * gain}%` }}
      />
      <div
        className={`${spoke} left-1/2 top-1/2 w-px -translate-x-1/2`}
        style={{ height: `${RADAR_MAX * growth}%` }}
      />
      <div
        className={`${spoke} right-1/2 top-1/2 h-px -translate-y-1/2`}
        style={{ width: `${RADAR_MAX * frontier}%` }}
      />

      {/* 顶点圆点 */}
      <span className={dot} style={{ left: "50%", top: `${50 - RADAR_MAX * exchange}%` }} />
      <span className={dot} style={{ left: `${50 + RADAR_MAX * gain}%`, top: "50%" }} />
      <span className={dot} style={{ left: "50%", top: `${50 + RADAR_MAX * growth}%` }} />
      <span className={dot} style={{ left: `${50 - RADAR_MAX * frontier}%`, top: "50%" }} />

      {/* 维度标签 */}
      <span
        className={`${eMono} absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#9ca3af]`}
      >
        交流
      </span>
      <span
        className={`${eMono} absolute -right-8 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#9ca3af]`}
      >
        收获
      </span>
      <span
        className={`${eMono} absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#9ca3af]`}
      >
        提升
      </span>
      <span
        className={`${eMono} absolute -left-8 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#9ca3af]`}
      >
        前沿
      </span>
    </div>
  );
}
