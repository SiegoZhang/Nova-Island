"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CommitColorPicker,
  CommitSlider,
  persistDotTuningValue,
  TuningPanelShell,
  TuningSlider,
} from "@/components/dotSystemTuningControls";
import { VideoDotMatrix } from "@/components/VideoDotMatrix";
import { clientLogoRows } from "@/lib/clientLogos";
import { prefersReducedMotion } from "@/lib/dotSystem/runtime";

// FDE 第一章卡片「深度合作头部企业」右侧的视觉：把 assets/globe.mp4 点阵化
// （跟 Hero 日出同一套 VideoDotMatrix——圆点/方点混杂、点色贴近卡片底色、
// 只有地球表面高光被染成品牌蓝），点阵地球上悬浮一圈合作品牌 logo。
//
// logo 排成 3×3 网格（中心留空让地球核心透出），每个品牌名包在一个半透明
// 小卡片里，有明确的结构感；所有卡片共用一个计时器「一起切换」——同时淡出、
// 换成各自子集里的下一个品牌名、再一起淡入，不是逐个错峰翻动。

// 默认参数收在这一个 as const 块里，本地开发时右下角的调参面板松手会 POST
// 到 /api/dev/dot-tuning 直接改写这里的数值（componentId: "fdeGlobe"），
// 刷新即生效。生产构建里面板整体被摇树掉，这份常量就是最终视觉。
const GLOBE_DEFAULTS = {
  // 网格密度倍率（相对 BASE_GRID 112×112），越大点越密。
  density: 1.15,
  dotMaxSize: 3.4,
  // 方形点占比，0=纯圆点，1=纯方点，0.5=圆/方各半。地球点阵统一用圆点。
  squareDotRatio: 0,
  opacityThreshold: 0.12,
  softness: 0.02,
  contrast: 2.5,
  // 边缘空间柔化起点（0~0.5），越小点阵越往中心收成一团。
  edgeFadeStart: 0.34,
  maxAlpha: 0.48,
  speed: 0.1,
  // 地球整体缩放（%，100=铺满点阵容器）——靠 CSS transform: scale() 缩放
  // 已渲染好的点阵画布，不改网格密度/点径，超出容器的部分被卡片
  // overflow-hidden 裁掉。只缩地球，不缩上面的 logo 网格。
  sizePercent: 129,
  // 亮度→颜色 4 段色阶：暗部贴卡片底色 #101012 融进背景，只有最亮端是
  // 品牌蓝高光。
  colorDark: "#1b1b1e",
  colorMid1: "#2b3350",
  colorMid2: "#1e34a0",
  colorHigh: "#1a38ce",
  // logo 一起切换的节奏：每张卡停留时长 + 单次淡入淡出时长（ms）。
  switchIntervalMs: 4600,
  fadeMs: 340,
} as const;

const BASE_GRID = 112;

// 3×3 网格里放 logo 卡片的格子序号（跳过 4 号中心格，让点阵地球的核心
// 从中间透出来）。
const CELLS = [0, 1, 2, 3, 5, 6, 7, 8];

export function FdeGlobeLogos({
  className,
  showLogos = true,
}: {
  className?: string;
  /** 是否渲染内置的 3×3 品牌 logo 网格。FDE 卡片改成「globe 不动、上层卡片
   *  随切换变动」之后，logo 网格由 FdeSection 里的 FdeBrandGrid 按分页单独
   *  渲染，这里传 false 只保留点阵地球本身。默认 true 保持独立使用时的行为。 */
  showLogos?: boolean;
}) {
  const [density, setDensity] = useState<number>(GLOBE_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(GLOBE_DEFAULTS.dotMaxSize);
  const [squareDotRatio, setSquareDotRatio] = useState<number>(GLOBE_DEFAULTS.squareDotRatio);
  const [opacityThreshold, setOpacityThreshold] = useState<number>(
    GLOBE_DEFAULTS.opacityThreshold,
  );
  const [softness, setSoftness] = useState<number>(GLOBE_DEFAULTS.softness);
  const [contrast, setContrast] = useState<number>(GLOBE_DEFAULTS.contrast);
  const [edgeFadeStart, setEdgeFadeStart] = useState<number>(GLOBE_DEFAULTS.edgeFadeStart);
  const [maxAlpha, setMaxAlpha] = useState<number>(GLOBE_DEFAULTS.maxAlpha);
  const [speed, setSpeed] = useState<number>(GLOBE_DEFAULTS.speed);
  const [colorDark, setColorDark] = useState<string>(GLOBE_DEFAULTS.colorDark);
  const [colorMid1, setColorMid1] = useState<string>(GLOBE_DEFAULTS.colorMid1);
  const [colorMid2, setColorMid2] = useState<string>(GLOBE_DEFAULTS.colorMid2);
  const [colorHigh, setColorHigh] = useState<string>(GLOBE_DEFAULTS.colorHigh);
  const [switchIntervalMs, setSwitchIntervalMs] = useState<number>(
    GLOBE_DEFAULTS.switchIntervalMs,
  );
  const [fadeMs, setFadeMs] = useState<number>(GLOBE_DEFAULTS.fadeMs);
  const [sizePercent, setSizePercent] = useState<number>(GLOBE_DEFAULTS.sizePercent);

  // SSR / 首帧一律 false（此时读不到 matchMedia），挂载后按用户的减少动效
  // 偏好一次性定下来——跟 HeroSection 里读 localStorage 快照同样的模式。
  const [animate, setAnimate] = useState(false);
  // 所有卡片共用的一份「当前轮次 + 是否可见」，保证一起切换。
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
      }, fadeMs);
    }, switchIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(fadeTimeoutId);
    };
  }, [animate, switchIntervalMs, fadeMs]);

  // 27 个合作品牌去重后按卡片数取模分组：每张卡拿到一份互不重叠的子集，
  // 任意一轮里都不会出现两个相同的品牌名。
  const cellNames = useMemo(() => {
    const pool = Array.from(new Set(clientLogoRows.flat()));
    return CELLS.map((_, i) => pool.filter((_, poolIndex) => poolIndex % CELLS.length === i));
  }, []);

  const colorStops = useMemo(
    () => [
      { stop: 0, hex: colorDark },
      { stop: 0.5, hex: colorMid1 },
      { stop: 0.8, hex: colorMid2 },
      { stop: 1, hex: colorHigh },
    ],
    [colorDark, colorMid1, colorMid2, colorHigh],
  );

  const grid = Math.max(16, Math.round(BASE_GRID * density));
  // 任一「重参数」提交后换 key 整体重挂载 VideoDotMatrix（它的可调项只在
  // 挂载时读一次）——跟 HeroSection 换 key 的做法一致。
  const matrixKey = [
    grid,
    dotMaxSize,
    squareDotRatio,
    opacityThreshold,
    softness,
    contrast,
    edgeFadeStart,
    maxAlpha,
    speed,
    colorDark,
    colorMid1,
    colorMid2,
    colorHigh,
  ].join("|");

  return (
    <div className={`relative overflow-hidden ${className ?? "size-full"}`}>
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${sizePercent / 100})` }}
      >
      <VideoDotMatrix
        key={matrixKey}
        src="/videos/globe.mp4"
        className="size-full"
        colorStops={colorStops}
        background="#101012"
        transparentBackground
        gridCols={grid}
        gridRows={grid}
        dotMaxSize={dotMaxSize}
        dotMinSize={0}
        opacityThreshold={opacityThreshold}
        softness={softness}
        contrast={contrast}
        edgeFadeStart={edgeFadeStart}
        maxAlpha={maxAlpha}
        speed={speed}
        squareDotRatio={squareDotRatio}
        entranceDurationMs={700}
        entranceScatter={0.85}
        mouseInteraction
        hoverColor={colorHigh}
      />
      </div>

      {/* 3×3 结构网格，logo 卡片各自居中在格子里，格子间距和中心空格让点阵
          地球在卡片之间透出来。独立使用时（showLogos 默认 true）才渲染。 */}
      {showLogos && (
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 place-items-center gap-2 p-1 md:gap-3">
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
      )}

      {process.env.NODE_ENV !== "production" && (
        <FdeGlobeTuningPanel
          density={density}
          onDensityChange={setDensity}
          dotMaxSize={dotMaxSize}
          onDotMaxSizeChange={setDotMaxSize}
          squareDotRatio={squareDotRatio}
          onSquareDotRatioChange={setSquareDotRatio}
          opacityThreshold={opacityThreshold}
          onOpacityThresholdChange={setOpacityThreshold}
          softness={softness}
          onSoftnessChange={setSoftness}
          contrast={contrast}
          onContrastChange={setContrast}
          edgeFadeStart={edgeFadeStart}
          onEdgeFadeStartChange={setEdgeFadeStart}
          maxAlpha={maxAlpha}
          onMaxAlphaChange={setMaxAlpha}
          speed={speed}
          onSpeedChange={setSpeed}
          sizePercent={sizePercent}
          onSizePercentChange={setSizePercent}
          colorDark={colorDark}
          onColorDarkChange={setColorDark}
          colorMid1={colorMid1}
          onColorMid1Change={setColorMid1}
          colorMid2={colorMid2}
          onColorMid2Change={setColorMid2}
          colorHigh={colorHigh}
          onColorHighChange={setColorHigh}
          switchIntervalMs={switchIntervalMs}
          onSwitchIntervalMsChange={setSwitchIntervalMs}
          fadeMs={fadeMs}
          onFadeMsChange={setFadeMs}
        />
      )}
    </div>
  );
}

// 仅开发环境渲染的调参面板，跟 RingSphereTuningPanel / HeroTuningPanel 同一
// 套模式：会触发 VideoDotMatrix 重挂载的重参数（密度/点径/方点占比/颜色/
// 阈值…）用 CommitSlider / CommitColorPicker（松手才提交，避免拖动过程中
// 反复重建 WebGL 场景），logo 切换节奏这类轻量数值用 TuningSlider 实时绑定。
function FdeGlobeTuningPanel(props: {
  density: number;
  onDensityChange: (v: number) => void;
  dotMaxSize: number;
  onDotMaxSizeChange: (v: number) => void;
  squareDotRatio: number;
  onSquareDotRatioChange: (v: number) => void;
  opacityThreshold: number;
  onOpacityThresholdChange: (v: number) => void;
  softness: number;
  onSoftnessChange: (v: number) => void;
  contrast: number;
  onContrastChange: (v: number) => void;
  edgeFadeStart: number;
  onEdgeFadeStartChange: (v: number) => void;
  maxAlpha: number;
  onMaxAlphaChange: (v: number) => void;
  speed: number;
  onSpeedChange: (v: number) => void;
  sizePercent: number;
  onSizePercentChange: (v: number) => void;
  colorDark: string;
  onColorDarkChange: (v: string) => void;
  colorMid1: string;
  onColorMid1Change: (v: string) => void;
  colorMid2: string;
  onColorMid2Change: (v: string) => void;
  colorHigh: string;
  onColorHighChange: (v: string) => void;
  switchIntervalMs: number;
  onSwitchIntervalMsChange: (v: number) => void;
  fadeMs: number;
  onFadeMsChange: (v: number) => void;
}) {
  return (
    <TuningPanelShell title="地球点阵调参（仅开发环境可见）">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium text-[#1c1917]">疏密 / 形状</p>
        <CommitSlider
          label="密度"
          value={props.density}
          min={0.3}
          max={2}
          step={0.05}
          unit="×"
          onCommit={(v) => {
            props.onDensityChange(v);
            persistDotTuningValue("fdeGlobe", "density", v);
          }}
        />
        <CommitSlider
          label="点径"
          value={props.dotMaxSize}
          min={1}
          max={14}
          step={0.1}
          unit="px"
          onCommit={(v) => {
            props.onDotMaxSizeChange(v);
            persistDotTuningValue("fdeGlobe", "dotMaxSize", v);
          }}
        />
        <CommitSlider
          label="方点比"
          value={props.squareDotRatio}
          min={0}
          max={1}
          step={0.05}
          unit=""
          onCommit={(v) => {
            props.onSquareDotRatioChange(v);
            persistDotTuningValue("fdeGlobe", "squareDotRatio", v);
          }}
        />
        <CommitSlider
          label="收拢"
          value={props.edgeFadeStart}
          min={0.15}
          max={0.5}
          step={0.01}
          unit=""
          onCommit={(v) => {
            props.onEdgeFadeStartChange(v);
            persistDotTuningValue("fdeGlobe", "edgeFadeStart", v);
          }}
        />
        <TuningSlider
          label="大小"
          value={props.sizePercent}
          min={40}
          max={200}
          step={1}
          unit="%"
          onChange={props.onSizePercentChange}
          onCommit={(v) => persistDotTuningValue("fdeGlobe", "sizePercent", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">亮度 / 抠形</p>
        <CommitSlider
          label="阈值"
          value={props.opacityThreshold}
          min={0}
          max={0.6}
          step={0.01}
          unit=""
          onCommit={(v) => {
            props.onOpacityThresholdChange(v);
            persistDotTuningValue("fdeGlobe", "opacityThreshold", v);
          }}
        />
        <CommitSlider
          label="柔化"
          value={props.softness}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onCommit={(v) => {
            props.onSoftnessChange(v);
            persistDotTuningValue("fdeGlobe", "softness", v);
          }}
        />
        <CommitSlider
          label="对比度"
          value={props.contrast}
          min={0.5}
          max={2.5}
          step={0.05}
          unit=""
          onCommit={(v) => {
            props.onContrastChange(v);
            persistDotTuningValue("fdeGlobe", "contrast", v);
          }}
        />
        <CommitSlider
          label="不透明"
          value={props.maxAlpha}
          min={0.2}
          max={1}
          step={0.02}
          unit=""
          onCommit={(v) => {
            props.onMaxAlphaChange(v);
            persistDotTuningValue("fdeGlobe", "maxAlpha", v);
          }}
        />
        <CommitSlider
          label="转速"
          value={props.speed}
          min={0.1}
          max={2}
          step={0.05}
          unit="×"
          onCommit={(v) => {
            props.onSpeedChange(v);
            persistDotTuningValue("fdeGlobe", "speed", v);
          }}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">色阶（暗 → 高光）</p>
        <CommitColorPicker
          label="暗部"
          value={props.colorDark}
          onCommit={(v) => {
            props.onColorDarkChange(v);
            persistDotTuningValue("fdeGlobe", "colorDark", v);
          }}
        />
        <CommitColorPicker
          label="中低"
          value={props.colorMid1}
          onCommit={(v) => {
            props.onColorMid1Change(v);
            persistDotTuningValue("fdeGlobe", "colorMid1", v);
          }}
        />
        <CommitColorPicker
          label="中高"
          value={props.colorMid2}
          onCommit={(v) => {
            props.onColorMid2Change(v);
            persistDotTuningValue("fdeGlobe", "colorMid2", v);
          }}
        />
        <CommitColorPicker
          label="高光"
          value={props.colorHigh}
          onCommit={(v) => {
            props.onColorHighChange(v);
            persistDotTuningValue("fdeGlobe", "colorHigh", v);
          }}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">logo 切换</p>
        <TuningSlider
          label="停留"
          value={props.switchIntervalMs}
          min={1500}
          max={9000}
          step={100}
          unit="ms"
          onChange={props.onSwitchIntervalMsChange}
          onCommit={(v) => persistDotTuningValue("fdeGlobe", "switchIntervalMs", v)}
        />
        <TuningSlider
          label="淡变"
          value={props.fadeMs}
          min={120}
          max={1200}
          step={20}
          unit="ms"
          onChange={props.onFadeMsChange}
          onCommit={(v) => persistDotTuningValue("fdeGlobe", "fadeMs", v)}
        />
      </div>
    </TuningPanelShell>
  );
}
