"use client";

import { useEffect, useState } from "react";

// 点阵调参面板共用的输入控件——原来只在 HeroSection.tsx 里私有定义（给
// HeroTuningPanel 用），现在 RingSphereDotMatrix 等其他"仅开发环境可见"
// 的调参面板也要用同一套滑块/取色器，抽到这个文件统一维护，两处都从这里
// import，不再各自维护一份。

export function TuningSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  /**
   * 松手/失焦时额外触发一次，只用来把这次拖动的最终值持久化（比如写回
   * 源文件的 *_DEFAULTS 常量），不影响 onChange 的实时预览——onChange
   * 该怎么连续触发还怎么触发，onCommit 只是在那之上加一个"结束"信号。
   * 可选，不传就跟以前行为完全一致。
   */
  onCommit?: (value: number) => void;
}) {
  const commit = () => onCommit?.(value);

  return (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[#78716c]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        className="w-24 flex-1 accent-[#2f56d8]"
      />
      <span className="w-10 shrink-0 text-right tabular-nums">
        {value}
        {unit}
      </span>
    </label>
  );
}

/**
 * 点阵调参面板的数值写回入口——本地开发时，面板里任何滑块/取色器松手，
 * 都可以调这个函数把最终值 POST 给 /api/dev/dot-tuning，由那个只在开发
 * 环境生效的路由直接改写对应组件文件里的 *_DEFAULTS 常量（以及 tokens.ts
 * 里的存档快照），下次热更新/刷新页面就是这次调好的数值——不再需要调完
 * 参之后手动把面板上的数字抄回源码。生产构建里 NODE_ENV 是 production，
 * 直接短路不发请求，也不会被打进生产包里实际调用。
 */
export function persistDotTuningValue(
  componentId: string,
  key: string,
  value: number | string,
) {
  if (process.env.NODE_ENV === "production") return;
  void fetch("/api/dev/dot-tuning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ componentId, key, value }),
  }).catch(() => {});
}

// 密度 / 颜色这类会触发 WebGL 场景销毁重建的重操作不能像模糊度那样直接绑
// 实时 onChange——拖动滑块/拖色板时原生 input 事件是连续触发的，如果每一
// 帧都提交到 state 会让场景反复销毁重建、抢占解码/GPU 资源，画面跟着卡顿
// 失帧。这里改成拖动过程只更新本地 draft（数值/色块实时跟手），松手/失焦
// 才真正提交一次，重建只发生一次。
export function CommitSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => onCommit(draft);

  return (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[#78716c]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        className="w-24 flex-1 accent-[#2f56d8]"
      />
      <span className="w-10 shrink-0 text-right tabular-nums">
        {draft}
        {unit}
      </span>
    </label>
  );
}

// 调参面板的外层容器——各处面板（Hero/旗帜/环形球体/工具……）都用同一套
// 「浮层 + 最小化」外壳：面板本身会常驻挡在卡片角落，边调参边看效果时经常
// 需要先把面板收起来才能看清那一小块被挡住的画面，默认展开等于每次进页面
// 都要先手动点一次最小化才能看清卡片，所以默认状态改成收起，只留一个小圆
// 按钮，需要调参时点开再展开成完整面板；状态只存在组件内部，不需要跟外部
// 同步。
export function TuningPanelShell({
  title,
  children,
  widthClassName = "w-[260px]",
  positionClassName = "right-2 bottom-2",
}: {
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
  positionClassName?: string;
}) {
  const [minimized, setMinimized] = useState(true);

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        title={`展开：${title}`}
        className={`pointer-events-auto absolute ${positionClassName} z-20 flex size-9 items-center justify-center rounded-full border border-black/[0.06] bg-[rgba(246,247,245,0.94)] text-[15px] text-[#78716c] shadow-[0_8px_24px_rgba(0,0,0,0.1)] backdrop-blur-[18px] transition hover:text-[#1c1917]`}
      >
        ⚙
      </button>
    );
  }

  return (
    // 面板整体高度按内容撑开，卡片矮的时候（比如手风琴左侧的 4:3 视觉区）
    // 内容可能比卡片还高——卡片自己有 overflow-hidden，超出卡片顶部的那截
    // 会被直接裁掉，连带标题和「最小化」按钮一起看不见也点不到。所以这里
    // 用 max-h 卡住面板不超过卡片高度，标题栏 shrink-0 常驻，超出的控件区
    // 自己内部滚动，保证「最小化」按钮任何卡片尺寸下都够得着。
    <div
      className={`pointer-events-auto absolute ${positionClassName} z-20 flex ${widthClassName} max-h-[calc(100%-24px)] flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-[rgba(246,247,245,0.94)] text-[12px] text-[#1c1917] shadow-[0_8px_24px_rgba(0,0,0,0.1)] backdrop-blur-[18px]`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-2">
        <p className="text-[11px] font-medium text-[#78716c]">{title}</p>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="shrink-0 rounded-full border border-black/[0.06] px-2 py-0.5 text-[11px] leading-[1.4] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
        >
          最小化
        </button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-3">{children}</div>
    </div>
  );
}

export function CommitColorPicker({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[#78716c]">{label}</span>
      <input
        type="color"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        className="size-6 shrink-0 cursor-pointer rounded border border-black/[0.1] bg-transparent p-0"
      />
      <span className="text-[#78716c] tabular-nums">{draft}</span>
    </label>
  );
}
