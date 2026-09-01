"use client";

import { useEffect, useRef, useState } from "react";

import { VARIANTS } from "./registry";

// 首页角落的方案切换器：给老板演示时随时换一套设计看。始终可见，固定在
// 右下角。点开是一个方案列表，选中即切换（HomeVariantHost 负责重挂载 +
// 写 URL / localStorage）。层级拉到最高，压过幻灯片的右侧圆点导航。
interface Props {
  activeId: string;
  onSelect: (id: string) => void;
}

export function HomeVariantSwitcher({ activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 只剩一套方案时切换器没意义（方案 A 已删），直接隐藏。加回第二套即恢复。
  const hidden = VARIANTS.length < 2;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (hidden) return null;

  const active = VARIANTS.find((v) => v.id === activeId) ?? VARIANTS[0];

  return (
    <div
      ref={rootRef}
      className="fixed bottom-4 right-4 z-[2147483000] flex flex-col items-end gap-2 font-[family-name:var(--font-geist-sans)]"
    >
      {open && (
        <div className="w-[280px] overflow-hidden rounded-2xl border border-white/15 bg-black/85 shadow-[0_16px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <p className="border-b border-white/10 px-4 py-2.5 text-[10px] uppercase tracking-[0.22em] text-white/40">
            首页方案 · 仅用于内部评审
          </p>
          <ul>
            {VARIANTS.map((v) => {
              const isActive = v.id === active.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(v.id);
                      setOpen(false);
                    }}
                    className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-white">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          isActive ? "bg-emerald-400" : "bg-white/25"
                        }`}
                      />
                      {v.label}
                    </span>
                    <span className="pl-3.5 text-xs leading-snug text-white/45">
                      {v.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/15 bg-black/80 px-4 py-2 text-xs text-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-colors hover:text-white"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="tabular-nums">{active.label}</span>
        <span className="text-white/40">切换</span>
      </button>
    </div>
  );
}
