"use client";

import Link from "next/link";
import { useState } from "react";

import {
  CommitSlider,
  persistDotTuningValue,
  TuningPanelShell,
  TuningSlider,
} from "@/components/dotSystemTuningControls";
import { VideoDotMatrix } from "@/components/VideoDotMatrix";
import { ePageContainer } from "@/lib/eleven";

// assets/联系圆圈.mp4 转存为 contact-circle.mp4：一圈燃烧的火焰光环，背景
// 是弥漫的烟雾（不是纯黑）。烟雾本身也有一定亮度，阈值/对比度都要比"黑底
// 光环"类视频（比如之前用过的联系我们.mp4）拉得更高，才能只挖出火环本身、
// 不把满屏的烟雾一起点阵化。colorLow/colorHigh 用两档蓝色按亮度区分：暗部
// 5F85DB，亮部 90B8F8，背景用纯黑 #000（首页整屏统一黑底），让这个 CTA
// 区域跟其余板块的黑底完全对齐。squareDotRatio 让部分点固定为方形，跟
// 圆形点混杂在同一片点阵里。
//
// 网格分辨率（gridCols/gridRows，也就是"点阵像素"）不再写死，改成
// density 倍率 × 基准网格，配一个仅开发环境可见的调参面板实时调节，松手
// 后通过 persistDotTuningValue 写回这里的 CONTACT_DEFAULTS，不需要手动
// 抄数值回源码。
const CONTACT_BASE_GRID_COLS = 88;
const CONTACT_BASE_GRID_ROWS = 50;

const CONTACT_DEFAULTS = {
  src: "/videos/contact-circle.mp4",
  background: "#000000",
  colorLow: "#5F85DB",
  colorHigh: "#90B8F8",
  squareDotRatio: 0.5,
  density: 1.95,
  dotMinSize: 0,
  dotMaxSize: 3,
  opacityThreshold: 0.42,
  // 硬边阈值：过了阈值的点直接按 maxAlpha 满不透明度显示，不再有一段
  // 渐变透明的过渡区，避免点阵颜色看起来是半透明的。
  softness: 0.02,
  contrast: 1.6,
  maxAlpha: 1,
  speed: 0.8,
  /** 跟 AI 社群点阵卡片一致，用独立的平移/缩放维度控制整体构图。 */
  rightShiftPercent: 0,
  downShiftPercent: 0,
  sizePercent: 178,
  /** 鼠标悬浮时的点阵聚拢效果，沿用 VideoDotMatrix 的 hover 交互模型。 */
  hoverRadiusPx: 175,
  hoverAttract: 0.19,
  hoverBoost: 0.5,
  hoverSizeBoost: 0.32,
  hoverColor: "#A9C4F5",
} as const;

const DOT_ENTRANCE_DURATION_MS = 700;

export function ContactCtaSection() {
  const [density, setDensity] = useState<number>(CONTACT_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(CONTACT_DEFAULTS.dotMaxSize);
  const [rightShiftPercent, setRightShiftPercent] = useState<number>(
    CONTACT_DEFAULTS.rightShiftPercent,
  );
  const [downShiftPercent, setDownShiftPercent] = useState<number>(
    CONTACT_DEFAULTS.downShiftPercent,
  );
  const [sizePercent, setSizePercent] = useState<number>(CONTACT_DEFAULTS.sizePercent);
  const [hoverRadiusPx, setHoverRadiusPx] = useState<number>(CONTACT_DEFAULTS.hoverRadiusPx);
  const [hoverAttract, setHoverAttract] = useState<number>(CONTACT_DEFAULTS.hoverAttract);
  const [hoverBoost, setHoverBoost] = useState<number>(CONTACT_DEFAULTS.hoverBoost);
  const [hoverSizeBoost, setHoverSizeBoost] = useState<number>(
    CONTACT_DEFAULTS.hoverSizeBoost,
  );
  const gridCols = Math.max(4, Math.round(CONTACT_BASE_GRID_COLS * density));
  const gridRows = Math.max(4, Math.round(CONTACT_BASE_GRID_ROWS * density));

  return (
    <section className="relative z-20 w-full overflow-hidden py-16">
      <div className={`${ePageContainer} flex min-h-[520px] items-center justify-center`}>
        {/* 光环视频点阵在这个方框里居中；文案+CTA 叠在同一个方框正中央，
            正好落在光环中心那片黑色镂空区域里，视觉上与光环合成一个整体，
            而不是两层互不相关的内容各自居中。窄屏下方框宽度被迫收窄到
            屏幕宽度，16:9 会把镂空区域压得又矮又窄，文案放不下——改用
            aspect-square 换取更多竖向空间，sm 断点起再切回原始 16:9，
            避免宽屏下方框被拉得过高。 */}
        <div className="relative aspect-square w-full max-w-[720px] sm:aspect-video">
          <div
            className="absolute inset-0"
            style={{
              transform: `translateX(${rightShiftPercent}%) translateY(${downShiftPercent}%) scale(${sizePercent / 100})`,
            }}
          >
            <VideoDotMatrix
              className="absolute inset-0"
              src={CONTACT_DEFAULTS.src}
              background={CONTACT_DEFAULTS.background}
              colorLow={CONTACT_DEFAULTS.colorLow}
              colorHigh={CONTACT_DEFAULTS.colorHigh}
              squareDotRatio={CONTACT_DEFAULTS.squareDotRatio}
              dotMinSize={CONTACT_DEFAULTS.dotMinSize}
              dotMaxSize={dotMaxSize}
              opacityThreshold={CONTACT_DEFAULTS.opacityThreshold}
              softness={CONTACT_DEFAULTS.softness}
              contrast={CONTACT_DEFAULTS.contrast}
              maxAlpha={CONTACT_DEFAULTS.maxAlpha}
              speed={CONTACT_DEFAULTS.speed}
              gridCols={gridCols}
              gridRows={gridRows}
              entranceDurationMs={DOT_ENTRANCE_DURATION_MS}
              entranceScatter={0.6}
              mouseInteraction
              hoverRadiusPx={hoverRadiusPx}
              hoverAttract={hoverAttract}
              hoverBoost={hoverBoost}
              hoverSizeBoost={hoverSizeBoost}
              hoverColor={CONTACT_DEFAULTS.hoverColor}
            />
          </div>

          <div className="reveal absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
            <h2
              data-title-reveal="1"
              className="text-[20px] leading-[1.15] font-medium tracking-[-0.02em] text-[#F8FAFA] sm:text-[26px] md:text-[32px]"
            >
              继续了解新岛
            </h2>
            <p
              data-title-reveal="2"
              className="mt-2 max-w-[160px] text-[13px] leading-[1.55] text-[#A3A5A6] sm:mt-3 sm:max-w-[230px] sm:text-[15px] sm:leading-[1.65]"
            >
              有问题、有合作意向，或者只是想聊聊 AI，都欢迎找我们。
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-[#F8FBFA] px-5 py-2.5 text-[13px] font-medium tracking-[-0.01em] text-[#22232A] transition-colors duration-200 hover:bg-[#F8FBFA]/90 active:scale-[0.97] sm:mt-7 sm:px-6 sm:py-3 sm:text-[14px]"
            >
              联系我们
            </Link>
          </div>

          {process.env.NODE_ENV !== "production" && (
            <TuningPanelShell title="联系我们点阵调参（仅开发环境可见）">
              <CommitSlider
                label="密度"
                value={density}
                min={0.4}
                max={2}
                step={0.05}
                unit="×"
                onCommit={(v) => {
                  setDensity(v);
                  persistDotTuningValue("contact", "density", v);
                }}
              />
              <TuningSlider
                label="点径"
                value={dotMaxSize}
                min={1}
                max={14}
                step={0.1}
                unit="px"
                onChange={setDotMaxSize}
                onCommit={(v) => persistDotTuningValue("contact", "dotMaxSize", v)}
              />
              <TuningSlider
                label="右移"
                value={rightShiftPercent}
                min={-20}
                max={40}
                step={1}
                unit="%"
                onChange={setRightShiftPercent}
                onCommit={(v) => persistDotTuningValue("contact", "rightShiftPercent", v)}
              />
              <TuningSlider
                label="下移"
                value={downShiftPercent}
                min={-40}
                max={40}
                step={1}
                unit="%"
                onChange={setDownShiftPercent}
                onCommit={(v) => persistDotTuningValue("contact", "downShiftPercent", v)}
              />
              <TuningSlider
                label="大小"
                value={sizePercent}
                min={40}
                max={240}
                step={1}
                unit="%"
                onChange={setSizePercent}
                onCommit={(v) => persistDotTuningValue("contact", "sizePercent", v)}
              />
              <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
                <p className="text-[11px] font-medium text-[#1c1917]">鼠标悬浮吸附</p>
                <TuningSlider
                  label="半径"
                  value={hoverRadiusPx}
                  min={60}
                  max={320}
                  step={5}
                  unit="px"
                  onChange={setHoverRadiusPx}
                  onCommit={(v) => persistDotTuningValue("contact", "hoverRadiusPx", v)}
                />
                <TuningSlider
                  label="吸附力"
                  value={hoverAttract}
                  min={0}
                  max={1}
                  step={0.01}
                  unit=""
                  onChange={setHoverAttract}
                  onCommit={(v) => persistDotTuningValue("contact", "hoverAttract", v)}
                />
                <TuningSlider
                  label="点亮"
                  value={hoverBoost}
                  min={0}
                  max={1}
                  step={0.01}
                  unit=""
                  onChange={setHoverBoost}
                  onCommit={(v) => persistDotTuningValue("contact", "hoverBoost", v)}
                />
                <TuningSlider
                  label="放大"
                  value={hoverSizeBoost}
                  min={0}
                  max={3}
                  step={0.05}
                  unit="×"
                  onChange={setHoverSizeBoost}
                  onCommit={(v) => persistDotTuningValue("contact", "hoverSizeBoost", v)}
                />
              </div>
            </TuningPanelShell>
          )}
        </div>
      </div>
    </section>
  );
}
