"use client";

import { useState } from "react";

import { GlassHead } from "@/components/GlassHead";

// 调试预览页：星尘人形（人物模型表面采样成虹彩玻璃珠点云，对齐 Hero 水晶球）。
// 用右侧滑杆把取景 / 保留比例 / 摆动 / 玻璃珠调到位，把数值报回来，我再写进
// AiCommunityCarousel 替换中间那尊点阵人像。
// 模型：public/models/person.glb。

const FIELDS = [
  { key: "pointCount", label: "点数（改动会重采样）", min: 4000, max: 45000, step: 1000, def: 22000 },
  { key: "keepTopFraction", label: "保留顶部比例", min: 0.12, max: 1, step: 0.01, def: 0.3 },
  { key: "zoom", label: "相机推进", min: 0.5, max: 3, step: 0.05, def: 1 },
  { key: "yOffset", label: "竖向偏移", min: -1.5, max: 1.5, step: 0.02, def: 0 },
  { key: "modelYaw", label: "朝向修正", min: -3.14, max: 3.14, step: 0.05, def: 0 },
  { key: "swaySpeed", label: "摆动速度", min: 0, max: 0.6, step: 0.01, def: 0.16 },
  { key: "swayAmp", label: "摆动幅度", min: 0, max: 1, step: 0.02, def: 0.32 },
  { key: "iridescence", label: "虹彩边", min: 0, max: 1, step: 0.02, def: 1 },
  { key: "edgeDrift", label: "轮廓飘散", min: 0, max: 2.5, step: 0.05, def: 1 },
  { key: "beadSize", label: "玻璃珠大小", min: 0.3, max: 2.5, step: 0.05, def: 1 },
] as const;

export default function GlassHeadLabPage() {
  const [params, setParams] = useState<Record<string, number>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, f.def])),
  );

  return (
    <main className="relative min-h-[100svh] w-full overflow-hidden bg-black">
      <div className="absolute inset-0">
        <GlassHead
          pointCount={params.pointCount}
          keepTopFraction={params.keepTopFraction}
          zoom={params.zoom}
          yOffset={params.yOffset}
          modelYaw={params.modelYaw}
          swaySpeed={params.swaySpeed}
          swayAmp={params.swayAmp}
          iridescence={params.iridescence}
          edgeDrift={params.edgeDrift}
          beadSize={params.beadSize}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%]"
        style={{ background: "linear-gradient(to top, #000 0%, transparent 100%)" }}
      />

      <div className="absolute right-4 top-4 w-[290px] rounded-xl border border-white/10 bg-black/70 p-4 text-[11px] text-white/70 backdrop-blur-md">
        <p className="mb-3 font-semibold text-white/90">星尘人形 · 调参</p>
        {FIELDS.map((f) => (
          <label key={f.key} className="mb-3 block">
            <span className="flex justify-between">
              <span>{f.label}</span>
              <span className="tabular-nums text-white/90">{params[f.key]}</span>
            </span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={params[f.key]}
              onChange={(e) => setParams((p) => ({ ...p, [f.key]: Number(e.target.value) }))}
              className="mt-1 w-full accent-white"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(JSON.stringify(params, null, 2))}
          className="mt-1 w-full rounded-md border border-white/20 py-1.5 text-white/80 hover:bg-white/10"
        >
          复制当前数值
        </button>
      </div>
    </main>
  );
}
