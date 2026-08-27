"use client";

import { useEffect, useMemo, useState } from "react";

import { clientLogoRows } from "@/lib/clientLogos";
import { prefersReducedMotion } from "@/lib/dotSystem/runtime";

// FDE 卡片第 01 页「深度合作头部企业」浮在点阵地球上方的一层：3×3 结构
// 网格（中心留空让地球核心透出），每个品牌名包在半透明小卡片里，所有
// 卡片共用一个计时器「一起切换」——同时淡出、换成各自子集里的下一个品牌
// 名、再一起淡入。原本内嵌在 FdeGlobeLogos 里，卡片改成「地球不动、上层
// 随分页切换」后拆出来单独渲染。

const CELLS = [0, 1, 2, 3, 5, 6, 7, 8];
const SWITCH_INTERVAL_MS = 4600;
const FADE_MS = 340;

export function FdeBrandGrid({ className }: { className?: string }) {
  const [animate, setAnimate] = useState(false);
  const [round, setRound] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimate(!prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (!animate) return;
    let fadeTimeoutId: number | undefined;
    const intervalId = window.setInterval(() => {
      setVisible(false);
      fadeTimeoutId = window.setTimeout(() => {
        setRound((r) => r + 1);
        setVisible(true);
      }, FADE_MS);
    }, SWITCH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(fadeTimeoutId);
    };
  }, [animate]);

  // 27 个合作品牌去重后按卡片数取模分组：每张卡拿到一份互不重叠的子集，
  // 任意一轮里都不会出现两个相同的品牌名。
  const cellNames = useMemo(() => {
    const pool = Array.from(new Set(clientLogoRows.flat()));
    return CELLS.map((_, i) => pool.filter((_, poolIndex) => poolIndex % CELLS.length === i));
  }, []);

  return (
    <div
      className={`pointer-events-none grid size-full grid-cols-3 grid-rows-3 place-items-center gap-2 md:gap-3 ${className ?? ""}`}
    >
      {Array.from({ length: 9 }, (_, cell) => {
        const slot = CELLS.indexOf(cell);
        if (slot === -1) return <div key={cell} aria-hidden="true" />;
        const names = cellNames[slot];
        const name = names[round % names.length];
        return (
          <div
            key={cell}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 backdrop-blur-[3px] transition-all duration-300 ease-out md:px-4 md:py-2.5"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(5px)",
            }}
          >
            <span className="block text-center text-[12px] font-medium tracking-[-0.01em] whitespace-nowrap text-white/85 md:text-[14px]">
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
