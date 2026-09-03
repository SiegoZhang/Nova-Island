"use client";

import { useCallback, useEffect, useState } from "react";

import { eMono } from "@/lib/eleven";

// 落地页（VariantEditorial）右缘的**页内导航 / 章节进度条**。
//
// 每个章节一行：一条贴右缘的短横线；命中的那行横线拉长 + 左侧浮现 mono 标签。
// 点击滚到对应章节。fixed 右缘竖直居中，z 低于 HomeNav、不挡右下角方案切换器。
//
// 章节底色明暗差别大（深空 / #EEEEF0 / #ddd8e8 / #332161），线和字颜色跟着
// **当前命中章节**的 dark 标记切浅 / 深，否则在浅底上看不见。
//
// 命中判定用 IntersectionObserver + `rootMargin: -50% 0 -50%`：哪个章节盖住
// 视口垂直中线就算当前章节，不额外挂 scroll 计算。rail 本身在离开首屏英雄区
// 后才淡入（避免盖在进场动画上）。

type RailSection = {
  id: string;
  label: string;
  /** 该章节背景是深色 → 线 / 字用浅色 */
  dark: boolean;
};

// id 对应各 section 上的 id：overview=UniverseTransition，其余见各自组件。
const SECTIONS: RailSection[] = [
  { id: "overview", label: "概览", dark: true },
  { id: "ai", label: "AI社群", dark: false },
  { id: "fde", label: "FDE", dark: false },
  { id: "team", label: "团队", dark: true },
  { id: "contact", label: "联系", dark: true },
];

export function SectionRail() {
  const [activeId, setActiveId] = useState("overview");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        // main 的 -8vh 负边距让 overview 末尾和 ai 开头有一小段重叠，中线可能
        // 同时压中两个章节，取章节中心离视口中线最近的那个。
        const mid = window.innerHeight / 2;
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top + a.boundingClientRect.height / 2 - mid) -
              Math.abs(b.boundingClientRect.top + b.boundingClientRect.height / 2 - mid),
          )[0];
        if (hit && hit.target instanceof HTMLElement) setActiveId(hit.target.id);
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));

    // 进场动画的关键几拍（球放大 → 星空铺满）都在头两屏内，等滚过那段再淡入。
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.7);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const go = useCallback((id: string) => {
    if (id === "overview") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const activeDark = SECTIONS.find((s) => s.id === activeId)?.dark ?? true;
  const ink = activeDark ? "255, 255, 255" : "17, 17, 17";

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed right-0 top-1/2 z-[90] hidden -translate-y-1/2 flex-col items-end gap-5 pr-5 transition-opacity duration-500 md:flex ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {SECTIONS.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            aria-current={active ? "true" : undefined}
            aria-label={`跳转到 ${s.label}`}
            tabIndex={visible ? undefined : -1}
            // pl-8 给非命中项（只有一条短线）留一点点击热区；label 只在命中项
            // 渲染，避免透明 label 在右侧撑出一整条看不见的点击拦截带。
            className={`group flex items-center justify-end gap-3 py-1.5 pl-8 ${
              visible ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            {active && (
              <span
                className={`${eMono} whitespace-nowrap text-[10px] uppercase tracking-[0.14em]`}
                style={{ color: `rgb(${ink})` }}
              >
                {s.label}
              </span>
            )}
            <span
              className="h-px shrink-0 transition-all duration-300 group-hover:opacity-70"
              style={{
                width: active ? 44 : 18,
                backgroundColor: `rgba(${ink}, ${active ? 0.9 : 0.34})`,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
