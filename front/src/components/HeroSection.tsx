"use client";

import { useEffect, useRef, useState } from "react";

import { HeroCtas } from "@/components/HeroCtas";
import {
  CommitColorPicker,
  CommitSlider,
  TuningPanelShell,
  TuningSlider,
} from "@/components/dotSystemTuningControls";
import { EarthRippleDotMatrix } from "@/components/EarthRippleDotMatrix";
import { VideoDotMatrix } from "@/components/VideoDotMatrix";
import { useHeroTheme } from "@/lib/heroTheme";

// 「日出视频」的调参来自 dot-system-studio 视频面板的实际截图数值（阈值
// 0.14 / 柔化 0.22 / 对比度 1.40）。对比度拉伸发生在阈值判断*之前*，1.40
// 会把这段视频本来偏窄的亮度范围（~0.26~0.68）在阈值附近拉开，才挖得出
// 太阳的轮廓——这部分跟画布尺寸无关，同一组阈值在 studio 的小预览和这里
// 1280px 宽的容器下都能正确挖空形状。
//
// gridCols/gridRows 按 1280:740 的实际容器宽高比分配网格数，让横纵格距
// 基本一致（都约 8px），而不是强行用同一个数——网格是正方形排布，被相机
// 投影非均匀拉伸铺满非正方形容器时，格距会跟着容器宽高比走样，横纵不等
// 的话点径顶格子的比例也会跟着不均衡（纵向更容易先重叠粘连）。
//   gridCols = round(1280 / 8) = 160   → 横向格距 1280/160 = 8.00px
//   gridRows = round(740  / 8) =  92   → 纵向格距 740/92  ≈ 8.04px
// dotMaxSize 取格距的 ~90%（7.2px）：数学上不会重叠，缝隙很窄，整体看
// 起来是"密实的点阵"而不是稀疏的小点。
//
// VideoDotMatrix 自身的 resize() 逻辑会在容器宽度随窗口变化时（Hero 是
// max-w-[1280px]，窗口变窄容器会跟着收窄）按"当前宽度 ÷ 挂载时的基准
// 宽度"重新缩放点径，让点相对格子的占比不随窗口宽度漂移。
//
// colorLow / colorHigh 现在只是 VideoDotMatrix 的兜底色阶两端 + hoverColor
// 的默认值——Hero 实际用的是下面 HERO_DOT_STOPS_DEFAULT 那条多段色阶
// （colorStops），近黑 → 深靛蓝 → 板岩蓝 → 浅长春花蓝 → 冷调冰白，取自
// 「蓝色马赛克水波」参照图。
//
// 注意：colorHigh 原本特意设成纯白、跟旧的白色背景同色，让太阳最亮核心
// "消隐"出一块留白给标题。现在背景是深色、色阶顶端是冰白，最亮处的点会
// 重新可见——标题下方那块留白改由 HERO_TEXT_CLEARING（跟背景同色的半圆
// 模糊遮罩）来补。
//
// maxAlpha 从 0.41 提到 0.82：之前每个点本身是半透明的（"透明处理"），
// 叠在一起才凑出实心的观感；现在直接把点本身调得接近不透明，点阵整体
// 更"实"、更有分量，不再是一层淡淡的雾。
const SUNRISE_VIDEO_TUNING = {
  src: "/videos/sunrise.mp4",
  background: "#ffffff",
  colorLow: "#07080e",
  colorHigh: "#f5f7fd",
  gridCols: 160,
  gridRows: 92,
  dotMinSize: 0,
  dotMaxSize: 7.2,
  maxAlpha: 0.82,
  speed: 0.65,
  opacityThreshold: 0.14,
  softness: 0.22,
  contrast: 1.4,
} as const;

// 点阵不再是单张 canvas 套一层统一模糊——那样水波（下半部分）柔化后好看，
// 但太阳/圆球最深的那圈蓝色点跟着糊掉，丢了点阵本该有的颗粒质感。现在拆成
// 两个独立的 VideoDotMatrix 实例叠放，同一段视频源各画一份：
// - 下层「模糊层」：不透明背景，正常/较密的网格，套 CSS blur，撑起整体
//   的柔和形体（水波的雾感）。
// - 上层「清晰层」：透明背景（VideoDotMatrix 新增的 transparentBackground
//   开关），网格比下层稀疏，点与点之间的空隙露出下面模糊层——稀疏的清晰
//   点浮在雾状的下层上面，就是"有模糊的也有清晰的"这种颗粒质感。
// 两层的模糊强度、网格密度都各自做成了 state，接了 HeroTuningPanel 里
// 分成"下层/上层"两组的滑块。只在 Hero 这一处这样叠两层，不改
// VideoDotMatrix 组件本身的默认行为，AI 社群区块、/ai 页仍是单层不透明。
const BASE_GRID_COLS = SUNRISE_VIDEO_TUNING.gridCols;
const BASE_GRID_ROWS = SUNRISE_VIDEO_TUNING.gridRows;

// 点阵色阶：近黑 → 深靛蓝 → 板岩蓝(带一点紫) → 浅长春花蓝 → 冷调冰白，
// 取自「蓝色马赛克水波」参照图的配色（黑底、浪脊那种偏冷的白高光，中间调
// 带轻微虹彩紫）。上下两层共用同一条——两层的区别只在模糊/密度/点径，不在
// 颜色。传给 VideoDotMatrix 的 colorStops，逐点按亮度取色。
//
// 色标向低亮度端压缩：sunrise.mp4 经 contrast 1.4 拉伸后，着色器里实际到手
// 的亮度峰值只有 ~0.75（视频原始亮度范围窄），色标如果按 0~1 均匀铺，最亮的
// 冰白（原来放在 1.0）永远取不到，最亮的点也只到中蓝。把冰白提前到 ~0.7、
// 末端再补一个更亮的冷白，才能让光带最亮处真正呈现出浪脊那种冷白高光。
const HERO_DOT_STOPS_DEFAULT: { stop: number; hex: string }[] = [
  { stop: 0, hex: "#07080e" },
  { stop: 0.18, hex: "#1b2245" },
  { stop: 0.38, hex: "#3d4784" },
  { stop: 0.55, hex: "#7e8ec8" },
  { stop: 0.7, hex: "#cdd6ec" },
  { stop: 1, hex: "#f5f7fd" },
];

const BOTTOM_BLUR_DEFAULT_PX = 8;
const BOTTOM_DENSITY_DEFAULT = 1.25; // 相对 BASE_GRID_COLS/ROWS 的倍率
const TOP_BLUR_DEFAULT_PX = 0;
const TOP_DENSITY_DEFAULT = 1.25;

// 「颜色浅的地方点更小」：亮度超过这个阈值就开始按亮度收缩点径。上下两层
// 共用，传给 VideoDotMatrix 的 highlightShrinkStart。
const HIGHLIGHT_SHRINK_START = 0.55;
const HIGHLIGHT_SHRINK_DEFAULT = 0.5; // 最亮处点径缩到 50%
const SIZE_JITTER_DEFAULT = 0.3; // 每点随机缩到 70%~100%，打散"大小一致"
// 点径默认沿用 SUNRISE_VIDEO_TUNING.dotMaxSize（7.2px，格距的 ~90%），
// 上下两层各自可独立调节，不改变原有默认观感。
const DOT_SIZE_DEFAULT: number = SUNRISE_VIDEO_TUNING.dotMaxSize;

// ── 「点阵地球 + 水波」风格（页面风格选项之二，仅开发环境可切换）──────
// 跟「日出视频」是**两个完全独立**的效果，不共用 shader / 组件：
// - 地球 + 水波：<EarthRippleDotMatrix>（Canvas 2D）——/images/earth.png
//   离屏采样出球面明暗，再叠一层**程序化生成**的流动半调（metaball +
//   flow-noise），几团蓝色亮斑在球面上缓慢漂移融合，就是参照帧里那种
//   鳞光流动的观感。容器放大压到 section 底部，overflow-hidden 只露出
//   上半段"地平线穹顶"。
// - 角球：/videos/globe.mp4（自转地球 + 星空，public 里已有）——右上角一小
//   块点阵球（VideoDotMatrix），opacityThreshold 抬高把星空底噪切掉，配一圈
//   SVG 轨道椭圆，呼应参照海报右上那颗线框地球。
// 不引入新的素材文件，也不改任何共享组件的默认行为。
const HERO_STYLE_DEFAULT: "sunrise" | "earth" = "sunrise";

const EARTH_RIPPLE_CELL_DEFAULT = 11;
const EARTH_RIPPLE_DOT_SIZE_DEFAULT = 4.2;
const EARTH_RIPPLE_SPEED_DEFAULT = 1;
const EARTH_RIPPLE_INTENSITY_DEFAULT = 1;
// 球体（点阵地球容器）的边长，css px。球心默认锁定在水平居中、
// hero y ≈ EARTH_RIPPLE_ANCHOR_Y；offsetX / offsetY 在此基础上平移。
const EARTH_RIPPLE_SIZE_DEFAULT = 1100;
const EARTH_RIPPLE_ANCHOR_Y = 180;
const EARTH_RIPPLE_OFFSET_X_DEFAULT = 0;
const EARTH_RIPPLE_OFFSET_Y_DEFAULT = 0;

function scaleGrid(density: number) {
  return {
    gridCols: Math.max(4, Math.round(BASE_GRID_COLS * density)),
    gridRows: Math.max(4, Math.round(BASE_GRID_ROWS * density)),
  };
}

// Hero 背景从纯白改成可调的线性渐变。注意：SUNRISE_VIDEO_TUNING.colorHigh
// （点阵最亮处的颜色）原本是特意设成纯白、跟背景同色，让太阳最亮的核心跟
// 背景"融为一色"消隐——背景一旦不是纯白，这块最亮的点会重新可见，不再
// 完全隐形，这是渐变背景带来的副作用，不是 bug。
const GRADIENT_FROM_DEFAULT = "#0a1330";
const GRADIENT_TO_DEFAULT = "#020306";
const GRADIENT_ANGLE_DEFAULT = 180;

const HERO_DOT_NOISE_OVERLAY = {
  className: "pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-overlay",
  style: {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
    backgroundRepeat: "repeat" as const,
    backgroundSize: "120px 120px",
  },
};

// 文案整体区域再挖一块不规则的"无色留白"——用一个模糊边缘的有机形状盖
// 在点阵画布之上、文字之下（DOM 顺序在 canvas 后、文字块前，同层叠层级
// 下后来的覆盖先来的），跟背景同色的模糊色块把这片区域里的点"擦掉"，边
// 缘靠 blur 做柔和过渡而不是硬边裁切。只在 Hero 这一处用，不改
// VideoDotMatrix 组件本身，其余用到它的地方（AI社群区块、/ai 页）不受
// 影响。颜色不再写死 bg-white——背景改渐变后，这块得跟着 heroGradient 走
// （在组件里用内联 style 传），才能继续"融入背景"而不是露出一块白斑。
// 形状原本是不规则的有机 blob（一圈波浪状 border-radius），跟点阵本身那个
// 半圆形的穹顶轮廓（视频阈值抠出来的形状）不协调，改成规整的半圆：宽高
// 比锁定 2:1（840×420），rounded-t-full 在这个比例下四角的圆角半径会被
// 浏览器按边长等比例收窄，正好收成 420px（= 高度 = 半宽），顶部两个圆角
// 严丝合缝拼成一条正圆弧，底边保持平直——数学上就是一个半圆，不是凑近似。
const HERO_TEXT_CLEARING_CLASSNAME =
  "pointer-events-none absolute left-1/2 top-[130px] h-[420px] w-[840px] -translate-x-1/2 rounded-t-full blur-[42px]";

// 入场动画：两层用同一个时长，各自的 entranceStart 都是自己视频就绪那一刻
// 起算（见 VideoDotMatrix 内部注释），所以是"同时开始、同时结束"，不是
// 靠外部计时器强行同步。区别只在 entranceScatter：下层 0 表示所有点同步
// 长大（撑起整体形体，不需要零散感）；上层给到 0.85，点会在这段时长里
// 错落地陆续冒出来，而不是整片一起出现。
//
// 文案 + CTA 不再等点阵入场完成才挂载——直接跟点阵同时起步、同时渐出，
// 用同一个 DOT_ENTRANCE_DURATION_MS 做 reveal 动画时长，四个元素（眉标/
// 标题/正文/CTA）也统一成同一份 delay（0），不再互相错峰，看起来是文案
// 整体跟点阵一起"长出来"，而不是分批依次弹出。
const DOT_ENTRANCE_DURATION_MS = 700;
const TOP_ENTRANCE_SCATTER = 0.85;

// 圆形/方形点混杂：约一半的点固定渲染成方形，跟圆形点交错分布，让点阵
// 颗粒感更明显、不再是清一色的圆点。上下两层各自独立随机分配（各自的
// squareDotRatio 是 VideoDotMatrix 挂载时读取一次的初始配置，见该组件
// 内 aShape 的注释），互不影响。
const SQUARE_DOT_RATIO_DEFAULT = 0.5;

// 仅开发环境调参面板用：面板里的每一次改动都实时写进 localStorage，
// 刷新页面/重启 dev server 后从这里恢复，不用每次都从默认值重新试。
// DEV_TUNING_ENABLED 跟面板本身挂载条件（NODE_ENV !== "production"）
// 一致——生产构建里 process.env.NODE_ENV 会被 Next.js 内联成字面量
// "production"，下面几处判断分支在生产包里会被直接摇树掉，不会读写
// localStorage、也不影响生产环境的默认视觉效果。
const DEV_TUNING_ENABLED = process.env.NODE_ENV !== "production";
// 每次改动色阶/渐变的代码默认值就把版本号 +1：旧快照里存的是当时的默认
// 值，直接沿用会把新配色盖掉。换 key 让旧快照失效，从新默认值重新开始调。
// v2：两色 mix → 多段色阶 + 深色渐变背景。
// v3：色标向低亮度端压缩，让高光真正能取到（见 HERO_DOT_STOPS_DEFAULT）。
// v4：配色换成「蓝色马赛克水波」参照图——近黑底 + 冷调冰白高光 + 虹彩紫中调。
// v5：新增「浅色收缩 / 尺寸抖动」两个尺寸维度，旧快照没有这两个字段。
// v6：新增「页面风格」开关（日出视频 / 点阵地球 + 水波）及水波层三个参数。
// v7：水波改成独立的 EarthRippleDotMatrix（程序化流动半调），换成
//     格距 / 点径 / 流速 / 强度 四个参数。
// v8：新增「球体大小」参数。
// v9：新增「球体位置」（水平/垂直平移）两个参数。
const HERO_DOT_TUNING_STORAGE_KEY = "novaisland:hero-dot-tuning:v9";

type HeroDotTuningSnapshot = {
  heroStyle: "sunrise" | "earth";
  dotStops: { stop: number; hex: string }[];
  bottomBlurPx: number;
  bottomDensity: number;
  bottomSquareRatio: number;
  bottomDotSize: number;
  topBlurPx: number;
  topDensity: number;
  topSquareRatio: number;
  topDotSize: number;
  earthRippleCellPx: number;
  earthRippleDotSize: number;
  earthRippleSpeed: number;
  earthRippleIntensity: number;
  earthRippleSize: number;
  earthRippleOffsetX: number;
  earthRippleOffsetY: number;
  highlightShrink: number;
  sizeJitter: number;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
};

const HERO_DOT_TUNING_DEFAULTS: HeroDotTuningSnapshot = {
  heroStyle: HERO_STYLE_DEFAULT,
  dotStops: HERO_DOT_STOPS_DEFAULT,
  bottomBlurPx: BOTTOM_BLUR_DEFAULT_PX,
  bottomDensity: BOTTOM_DENSITY_DEFAULT,
  bottomSquareRatio: SQUARE_DOT_RATIO_DEFAULT,
  bottomDotSize: DOT_SIZE_DEFAULT,
  topBlurPx: TOP_BLUR_DEFAULT_PX,
  topDensity: TOP_DENSITY_DEFAULT,
  topSquareRatio: SQUARE_DOT_RATIO_DEFAULT,
  topDotSize: DOT_SIZE_DEFAULT,
  earthRippleCellPx: EARTH_RIPPLE_CELL_DEFAULT,
  earthRippleDotSize: EARTH_RIPPLE_DOT_SIZE_DEFAULT,
  earthRippleSpeed: EARTH_RIPPLE_SPEED_DEFAULT,
  earthRippleIntensity: EARTH_RIPPLE_INTENSITY_DEFAULT,
  earthRippleSize: EARTH_RIPPLE_SIZE_DEFAULT,
  earthRippleOffsetX: EARTH_RIPPLE_OFFSET_X_DEFAULT,
  earthRippleOffsetY: EARTH_RIPPLE_OFFSET_Y_DEFAULT,
  highlightShrink: HIGHLIGHT_SHRINK_DEFAULT,
  sizeJitter: SIZE_JITTER_DEFAULT,
  gradientFrom: GRADIENT_FROM_DEFAULT,
  gradientTo: GRADIENT_TO_DEFAULT,
  gradientAngle: GRADIENT_ANGLE_DEFAULT,
};

// 解析 localStorage 里的调参快照，缺字段/解析失败都回落到默认值。只在
// 客户端挂载后的 useEffect 里调用——绝不能放进 useState 的惰性初始值：
// SSR 时 window 不存在只能返回默认值，客户端首帧却会读到 localStorage 里
// 的快照，两边首次渲染结果不一致就会触发 hydration mismatch。
function loadHeroDotTuning(): HeroDotTuningSnapshot {
  if (!DEV_TUNING_ENABLED || typeof window === "undefined") {
    return HERO_DOT_TUNING_DEFAULTS;
  }
  try {
    const raw = window.localStorage.getItem(HERO_DOT_TUNING_STORAGE_KEY);
    if (!raw) return HERO_DOT_TUNING_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<HeroDotTuningSnapshot>;
    return { ...HERO_DOT_TUNING_DEFAULTS, ...parsed };
  } catch {
    return HERO_DOT_TUNING_DEFAULTS;
  }
}

export function HeroSection() {
  const { setIsHeroLight, setHideHeroRails } = useHeroTheme();
  // 整份调参快照放在一个 state 对象里：一律用默认值初始化，SSR 和客户端
  // 首帧必须完全一致；上次调参的值在下面的挂载 effect 里一次性 setState
  // 读回来，不放进 useState 初始值（那样客户端首帧会读到 localStorage、
  // 跟 SSR 的默认值对不上，触发 hydration mismatch）。
  const [tuning, setTuning] = useState<HeroDotTuningSnapshot>(HERO_DOT_TUNING_DEFAULTS);
  const {
    heroStyle,
    dotStops,
    bottomBlurPx,
    bottomDensity,
    bottomSquareRatio,
    bottomDotSize,
    topBlurPx,
    topDensity,
    topSquareRatio,
    topDotSize,
    earthRippleCellPx,
    earthRippleDotSize,
    earthRippleSpeed,
    earthRippleIntensity,
    earthRippleSize,
    earthRippleOffsetX,
    earthRippleOffsetY,
    highlightShrink,
    sizeJitter,
    gradientFrom,
    gradientTo,
    gradientAngle,
  } = tuning;

  const patchTuning = (patch: Partial<HeroDotTuningSnapshot>) =>
    setTuning((prev) => ({ ...prev, ...patch }));

  const setDotStopHex = (index: number, hex: string) =>
    setTuning((prev) => ({
      ...prev,
      dotStops: prev.dotStops.map((s, i) => (i === index ? { ...s, hex } : s)),
    }));

  // 挂载后（仅开发环境）把上次调参的快照一次性读回来。放在 effect 里而
  // 不是 useState 初始值里，是为了让 SSR / 客户端首帧渲染完全一致；跟默认
  // 值不同的字段会在这一帧之后生效，视觉上就是加载后闪一下到上次调好的值。
  // 这是"从外部存储补初始状态"，只跑一次、不构成级联渲染。
  useEffect(() => {
    if (!DEV_TUNING_ENABLED || typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTuning(loadHeroDotTuning());
  }, []);

  // 面板里任何一个数值变化（包括拖动过程中逐帧变化的滑块）都立即重新
  // 写一份完整快照——不是等某个"保存"按钮,而是状态一变就落盘,所以
  // 刷新页面能拿到的永远是最后一次改动后的值。
  // skipFirstPersist 跳过挂载那一次（首帧用的是默认值 / 或马上要被上面
  // 读盘 effect 覆盖），避免用默认值把上次的快照冲掉；之后每次真实改动
  // 都会落盘。
  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (!DEV_TUNING_ENABLED || typeof window === "undefined") return;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(HERO_DOT_TUNING_STORAGE_KEY, JSON.stringify(tuning));
    } catch {
      // 隐私模式/存储配额被禁：静默忽略，不影响调参面板本身的可用性。
    }
  }, [tuning]);

  const bottomGrid = scaleGrid(bottomDensity);
  const topGrid = scaleGrid(topDensity);
  const isEarth = heroStyle === "earth";
  // 「日出视频」用可调的深色渐变；「点阵地球 + 水波」是白底 —— 球体点阵
  // 用深蓝色画在白底上，只露出下半个球（上半被顶部渐隐遮住）。
  const heroGradient = isEarth
    ? "#ffffff"
    : `linear-gradient(${gradientAngle}deg, ${gradientFrom}, ${gradientTo})`;
  // 换 key 用：色阶 / highlightShrink / sizeJitter 这些 VideoDotMatrix 只在
  // 挂载时读一次的参数，任一变化就让两层整体重挂载，跟原来颜色选择器触发
  // 重挂载的机制一致。
  const remountKey = `${dotStops.map((s) => s.hex).join("-")}-${highlightShrink}-${sizeJitter}`;

  // 只剩「日出视频」这一个白底效果，导航栏/网格竖线的状态是固定的常量，
  // 不用再按变体切换——只在挂载时通知一次。
  useEffect(() => {
    setIsHeroLight(true);
    setHideHeroRails(true);
  }, [setIsHeroLight, setHideHeroRails]);

  return (
    <section id="hero" className="relative h-[740px]">
      <div aria-hidden="true" className="absolute inset-0" style={{ background: heroGradient }} />

      <div
        className="relative flex h-full w-full items-start justify-center overflow-hidden"
        style={{ background: heroGradient }}
      >
        {heroStyle === "earth" ? (
          <EarthBackdrop
            cellPx={earthRippleCellPx}
            dotSize={earthRippleDotSize}
            rippleSpeed={earthRippleSpeed}
            rippleIntensity={earthRippleIntensity}
            sphereSize={earthRippleSize}
            offsetX={earthRippleOffsetX}
            offsetY={earthRippleOffsetY}
          />
        ) : (
        <>
        {/* 下层：模糊层，撑起整体柔和形体。也要开 transparentBackground——
            背景现在是渐变而不是纯白，画布如果还留着不透明清屏色，会整块
            盖掉下面的渐变，只在有点的地方才看得到颜色，等于白铺一层。
            colorLow/gridCols/gridRows 里只有 gridCols/gridRows 是 VideoDotMatrix
            内部响应式的（挂载 effect 的依赖之一），colorLow 只在挂载时读取一次，
            换 key 强制在颜色变化时整体重挂载，颜色选择器才会生效。上下两层的
            颜色/模糊/密度分别是独立 state，互不影响，调其中一层不会带动另一层。 */}
        <div className="absolute inset-0" style={{ filter: `blur(${bottomBlurPx}px)` }}>
          <VideoDotMatrix
            key={`bottom-${remountKey}-${bottomSquareRatio}-${bottomDotSize}`}
            className="size-full"
            {...SUNRISE_VIDEO_TUNING}
            colorStops={dotStops}
            highlightShrink={highlightShrink}
            highlightShrinkStart={HIGHLIGHT_SHRINK_START}
            sizeJitter={sizeJitter}
            gridCols={bottomGrid.gridCols}
            gridRows={bottomGrid.gridRows}
            dotMaxSize={bottomDotSize}
            squareDotRatio={bottomSquareRatio}
            transparentBackground
            entranceDurationMs={DOT_ENTRANCE_DURATION_MS}
            mouseInteraction
            hoverColor="#ffffff"
          />
        </div>

        {/* 上层：透明背景 + 更稀疏的网格，点与点之间露出下层的模糊雾感，
            entranceScatter 让点错落地陆续冒出来，跟下层"整片同步长大"
            的入场方式形成对比。 */}
        <div className="absolute inset-0" style={{ filter: `blur(${topBlurPx}px)` }}>
          <VideoDotMatrix
            key={`top-${remountKey}-${topSquareRatio}-${topDotSize}`}
            className="size-full"
            {...SUNRISE_VIDEO_TUNING}
            colorStops={dotStops}
            highlightShrink={highlightShrink}
            highlightShrinkStart={HIGHLIGHT_SHRINK_START}
            sizeJitter={sizeJitter}
            gridCols={topGrid.gridCols}
            gridRows={topGrid.gridRows}
            dotMaxSize={topDotSize}
            squareDotRatio={topSquareRatio}
            transparentBackground
            entranceDurationMs={DOT_ENTRANCE_DURATION_MS}
            entranceScatter={TOP_ENTRANCE_SCATTER}
            mouseInteraction
            hoverColor="#ffffff"
          />
        </div>
        </>
        )}

        <div
          aria-hidden="true"
          className={HERO_DOT_NOISE_OVERLAY.className}
          style={HERO_DOT_NOISE_OVERLAY.style}
        />

        <div
          aria-hidden="true"
          className={HERO_TEXT_CLEARING_CLASSNAME}
          style={{ background: heroGradient }}
        />

        <div
          className={`relative flex flex-col items-center px-6 text-center ${
            isEarth ? "pt-[96px]" : "pt-[196px]"
          }`}
        >
          {/* 文案 + CTA 挂载即播放，跟点阵入场同时起步——不再等 dotsReady。
              四个元素（眉标/标题/正文/CTA）统一用 DOT_ENTRANCE_DURATION_MS
              做 reveal 动画时长、delay 都是 0，不再互相错峰，整体作为一块
              跟点阵一起渐出，而不是分批依次弹出。 */}
          <div className="flex flex-col items-center">
            {/* 背景从纯白换成深色渐变后，文字整套跟着换成浅色系，同时保留
                原来的主次层级：标题最亮最重（纯白），正文次之（白 75%），
                眉标最轻（白 55%），层级关系跟深色前保持一致，只是明度方向
                反过来了。CTA 也要跟着切：HeroCtas 的 light 参数语义是"衬在
                浅色 Hero 上要用深色按钮"，现在 Hero 是深色，改成 light={false}
                换成白色系按钮，不然黑字黑底会看不见。 */}
            <p
              className={`reveal text-[15px] font-medium ${isEarth ? "text-black/55" : "text-white/55"}`}
              style={{ animationDuration: `${DOT_ENTRANCE_DURATION_MS}ms` }}
            >
              让 AI 从认知走向价值
            </p>

            <h1
              className={`reveal mt-5 bg-gradient-to-r bg-clip-text text-[clamp(56px,11vw,84px)] font-semibold leading-[1.05] tracking-[-0.03em] text-transparent ${
                isEarth ? "from-[#1c1917] to-[#3b3b3b]" : "from-[#d9d9d9] to-white"
              }`}
              style={{ animationDuration: `${DOT_ENTRANCE_DURATION_MS}ms` }}
            >
              新岛
            </h1>

            <p
              className={`reveal mt-8 max-w-[600px] text-[18px] leading-[1.6] ${isEarth ? "text-black/70" : "text-white/75"}`}
              style={{ animationDuration: `${DOT_ENTRANCE_DURATION_MS}ms` }}
            >
              专注于人工智能领域的知识服务与工程落地，以AI社群保持认知领先，以FDE驱动工程落地。
            </p>

            <HeroCtas light={isEarth} revealDurationMs={DOT_ENTRANCE_DURATION_MS} revealDelayMs={0} />
          </div>
        </div>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <HeroTuningPanel
          heroStyle={heroStyle}
          onHeroStyleChange={(v) => patchTuning({ heroStyle: v })}
          earthRippleCellPx={earthRippleCellPx}
          onEarthRippleCellPxChange={(v) => patchTuning({ earthRippleCellPx: v })}
          earthRippleDotSize={earthRippleDotSize}
          onEarthRippleDotSizeChange={(v) => patchTuning({ earthRippleDotSize: v })}
          earthRippleSpeed={earthRippleSpeed}
          onEarthRippleSpeedChange={(v) => patchTuning({ earthRippleSpeed: v })}
          earthRippleIntensity={earthRippleIntensity}
          onEarthRippleIntensityChange={(v) => patchTuning({ earthRippleIntensity: v })}
          earthRippleSize={earthRippleSize}
          onEarthRippleSizeChange={(v) => patchTuning({ earthRippleSize: v })}
          earthRippleOffsetX={earthRippleOffsetX}
          onEarthRippleOffsetXChange={(v) => patchTuning({ earthRippleOffsetX: v })}
          earthRippleOffsetY={earthRippleOffsetY}
          onEarthRippleOffsetYChange={(v) => patchTuning({ earthRippleOffsetY: v })}
          dotStops={dotStops}
          onDotStopHexChange={setDotStopHex}
          highlightShrink={highlightShrink}
          onHighlightShrinkChange={(v) => patchTuning({ highlightShrink: v })}
          sizeJitter={sizeJitter}
          onSizeJitterChange={(v) => patchTuning({ sizeJitter: v })}
          bottomBlurPx={bottomBlurPx}
          onBottomBlurChange={(v) => patchTuning({ bottomBlurPx: v })}
          bottomDensity={bottomDensity}
          onBottomDensityChange={(v) => patchTuning({ bottomDensity: v })}
          bottomSquareRatio={bottomSquareRatio}
          onBottomSquareRatioChange={(v) => patchTuning({ bottomSquareRatio: v })}
          bottomDotSize={bottomDotSize}
          onBottomDotSizeChange={(v) => patchTuning({ bottomDotSize: v })}
          topBlurPx={topBlurPx}
          onTopBlurChange={(v) => patchTuning({ topBlurPx: v })}
          topDensity={topDensity}
          onTopDensityChange={(v) => patchTuning({ topDensity: v })}
          topSquareRatio={topSquareRatio}
          onTopSquareRatioChange={(v) => patchTuning({ topSquareRatio: v })}
          topDotSize={topDotSize}
          onTopDotSizeChange={(v) => patchTuning({ topDotSize: v })}
          gradientFrom={gradientFrom}
          onGradientFromChange={(v) => patchTuning({ gradientFrom: v })}
          gradientTo={gradientTo}
          onGradientToChange={(v) => patchTuning({ gradientTo: v })}
          gradientAngle={gradientAngle}
          onGradientAngleChange={(v) => patchTuning({ gradientAngle: v })}
        />
      )}
    </section>
  );
}

// <EarthRippleDotMatrix>：一套**跟 sunrise 毫无关系**的独立实现——没有
// 视频源，水波是在球面经纬度上算出来的波源干涉。白底。
// 容器边长 = sphereSize（可调）；球心默认水平居中 + hero y ≈
// EARTH_RIPPLE_ANCHOR_Y，offsetX / offsetY 在此基础上平移。顶部渐隐 mask
// 把球体上半擦掉，只留下半个球。
function EarthBackdrop({
  cellPx,
  dotSize,
  rippleSpeed,
  rippleIntensity,
  sphereSize,
  offsetX,
  offsetY,
}: {
  cellPx: number;
  dotSize: number;
  rippleSpeed: number;
  rippleIntensity: number;
  sphereSize: number;
  offsetX: number;
  offsetY: number;
}) {
  const top = EARTH_RIPPLE_ANCHOR_Y + offsetY - sphereSize / 2;
  return (
    <div
      className="fade-in pointer-events-none absolute -translate-x-1/2"
      style={{
        top,
        left: `calc(50% + ${offsetX}px)`,
        width: sphereSize,
        height: sphereSize,
        maskImage:
          "linear-gradient(180deg, transparent 0%, transparent 44%, #000 52%)",
        WebkitMaskImage:
          "linear-gradient(180deg, transparent 0%, transparent 44%, #000 52%)",
      }}
    >
      <EarthRippleDotMatrix
        key={`earth-ripple-${cellPx}-${dotSize}-${sphereSize}`}
        cellPx={cellPx}
        maxRadiusPx={dotSize}
        rippleSpeed={rippleSpeed}
        rippleIntensity={rippleIntensity}
      />
    </div>
  );
}

// 仅开发环境渲染的调参面板，用来现场试上下两层各自的颜色/模糊度/网格密度，
// 不进生产构建。上下两组滑块各自绑定独立 state，调其中一组只影响对应那一层，
// 不会带动另一层。只影响本组件内的 state，不碰 VideoDotMatrix /
// dot-system-studio 的默认值。
function HeroTuningPanel({
  heroStyle,
  onHeroStyleChange,
  earthRippleCellPx,
  onEarthRippleCellPxChange,
  earthRippleDotSize,
  onEarthRippleDotSizeChange,
  earthRippleSpeed,
  onEarthRippleSpeedChange,
  earthRippleIntensity,
  onEarthRippleIntensityChange,
  earthRippleSize,
  onEarthRippleSizeChange,
  earthRippleOffsetX,
  onEarthRippleOffsetXChange,
  earthRippleOffsetY,
  onEarthRippleOffsetYChange,
  dotStops,
  onDotStopHexChange,
  highlightShrink,
  onHighlightShrinkChange,
  sizeJitter,
  onSizeJitterChange,
  bottomBlurPx,
  onBottomBlurChange,
  bottomDensity,
  onBottomDensityChange,
  bottomSquareRatio,
  onBottomSquareRatioChange,
  bottomDotSize,
  onBottomDotSizeChange,
  topBlurPx,
  onTopBlurChange,
  topDensity,
  onTopDensityChange,
  topSquareRatio,
  onTopSquareRatioChange,
  topDotSize,
  onTopDotSizeChange,
  gradientFrom,
  onGradientFromChange,
  gradientTo,
  onGradientToChange,
  gradientAngle,
  onGradientAngleChange,
}: {
  heroStyle: "sunrise" | "earth";
  onHeroStyleChange: (value: "sunrise" | "earth") => void;
  earthRippleCellPx: number;
  onEarthRippleCellPxChange: (value: number) => void;
  earthRippleDotSize: number;
  onEarthRippleDotSizeChange: (value: number) => void;
  earthRippleSpeed: number;
  onEarthRippleSpeedChange: (value: number) => void;
  earthRippleIntensity: number;
  onEarthRippleIntensityChange: (value: number) => void;
  earthRippleSize: number;
  onEarthRippleSizeChange: (value: number) => void;
  earthRippleOffsetX: number;
  onEarthRippleOffsetXChange: (value: number) => void;
  earthRippleOffsetY: number;
  onEarthRippleOffsetYChange: (value: number) => void;
  dotStops: { stop: number; hex: string }[];
  onDotStopHexChange: (index: number, hex: string) => void;
  highlightShrink: number;
  onHighlightShrinkChange: (value: number) => void;
  sizeJitter: number;
  onSizeJitterChange: (value: number) => void;
  bottomBlurPx: number;
  onBottomBlurChange: (value: number) => void;
  bottomDensity: number;
  onBottomDensityChange: (value: number) => void;
  bottomSquareRatio: number;
  onBottomSquareRatioChange: (value: number) => void;
  bottomDotSize: number;
  onBottomDotSizeChange: (value: number) => void;
  topBlurPx: number;
  onTopBlurChange: (value: number) => void;
  topDensity: number;
  onTopDensityChange: (value: number) => void;
  topSquareRatio: number;
  onTopSquareRatioChange: (value: number) => void;
  topDotSize: number;
  onTopDotSizeChange: (value: number) => void;
  gradientFrom: string;
  onGradientFromChange: (value: string) => void;
  gradientTo: string;
  onGradientToChange: (value: string) => void;
  gradientAngle: number;
  onGradientAngleChange: (value: number) => void;
}) {
  return (
    <TuningPanelShell
      title="点阵调参（仅开发环境可见）"
      widthClassName="w-[280px]"
      positionClassName="right-4 bottom-4"
    >
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium text-[#1c1917]">页面风格</p>
        <div className="flex gap-1.5">
          {([
            ["sunrise", "日出视频"],
            ["earth", "点阵地球 + 水波"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onHeroStyleChange(value)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] leading-[1.3] transition ${
                heroStyle === value
                  ? "border-[#2f56d8] bg-[#2f56d8] text-white"
                  : "border-black/[0.12] text-[#78716c] hover:bg-black/[0.04]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ↓↓↓ 「日出视频」专属调节：色阶 / 尺寸 / 上下层 / 背景渐变。
             切到「点阵地球 + 水波」时整块隐藏，两套调节器互不相通。 */}
      {heroStyle === "sunrise" && (
      <>
      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">点阵 · 色阶</p>
        {dotStops.map((stop, index) => (
          <CommitColorPicker
            key={index}
            label={`${Math.round(stop.stop * 100)}%`}
            value={stop.hex}
            onCommit={(value) => onDotStopHexChange(index, value)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">点阵 · 尺寸（上下层共用）</p>
        <CommitSlider
          label="浅色收缩"
          value={highlightShrink}
          min={0}
          max={1}
          step={0.05}
          unit=""
          onCommit={onHighlightShrinkChange}
        />
        <CommitSlider
          label="尺寸抖动"
          value={sizeJitter}
          min={0}
          max={0.8}
          step={0.05}
          unit=""
          onCommit={onSizeJitterChange}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">下层 · 模糊</p>
        <TuningSlider
          label="模糊度"
          value={bottomBlurPx}
          min={0}
          max={10}
          step={0.5}
          unit="px"
          onChange={onBottomBlurChange}
        />
        <CommitSlider
          label="密度"
          value={bottomDensity}
          min={0.2}
          max={1.5}
          step={0.05}
          unit="×"
          onCommit={onBottomDensityChange}
        />
        <CommitSlider
          label="方点占比"
          value={bottomSquareRatio}
          min={0}
          max={1}
          step={0.05}
          unit=""
          onCommit={onBottomSquareRatioChange}
        />
        <CommitSlider
          label="点径"
          value={bottomDotSize}
          min={1}
          max={14}
          step={0.2}
          unit="px"
          onCommit={onBottomDotSizeChange}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">上层 · 清晰</p>
        <TuningSlider
          label="模糊度"
          value={topBlurPx}
          min={0}
          max={10}
          step={0.5}
          unit="px"
          onChange={onTopBlurChange}
        />
        <CommitSlider
          label="密度"
          value={topDensity}
          min={0.05}
          max={1.5}
          step={0.05}
          unit="×"
          onCommit={onTopDensityChange}
        />
        <CommitSlider
          label="方点占比"
          value={topSquareRatio}
          min={0}
          max={1}
          step={0.05}
          unit=""
          onCommit={onTopSquareRatioChange}
        />
        <CommitSlider
          label="点径"
          value={topDotSize}
          min={1}
          max={14}
          step={0.2}
          unit="px"
          onCommit={onTopDotSizeChange}
        />
      </div>
      </>
      )}

      {heroStyle === "earth" && (
      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">点阵地球 + 水波</p>
        <CommitSlider
          label="格距"
          value={earthRippleCellPx}
          min={6}
          max={20}
          step={1}
          unit="px"
          onCommit={onEarthRippleCellPxChange}
        />
        <CommitSlider
          label="点径"
          value={earthRippleDotSize}
          min={1.5}
          max={9}
          step={0.2}
          unit="px"
          onCommit={onEarthRippleDotSizeChange}
        />
        <CommitSlider
          label="流速"
          value={earthRippleSpeed}
          min={0}
          max={3}
          step={0.1}
          unit="×"
          onCommit={onEarthRippleSpeedChange}
        />
        <CommitSlider
          label="水波强度"
          value={earthRippleIntensity}
          min={0}
          max={1.6}
          step={0.05}
          unit=""
          onCommit={onEarthRippleIntensityChange}
        />
        <CommitSlider
          label="球体大小"
          value={earthRippleSize}
          min={600}
          max={2000}
          step={20}
          unit="px"
          onCommit={onEarthRippleSizeChange}
        />
        <TuningSlider
          label="水平位置"
          value={earthRippleOffsetX}
          min={-600}
          max={600}
          step={10}
          unit="px"
          onChange={onEarthRippleOffsetXChange}
        />
        <TuningSlider
          label="垂直位置"
          value={earthRippleOffsetY}
          min={-400}
          max={400}
          step={10}
          unit="px"
          onChange={onEarthRippleOffsetYChange}
        />
      </div>
      )}

      {heroStyle === "sunrise" && (
      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">背景 · 渐变</p>
        <label className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-[#78716c]">起始色</span>
          <input
            type="color"
            value={gradientFrom}
            onChange={(event) => onGradientFromChange(event.target.value)}
            className="size-6 shrink-0 cursor-pointer rounded border border-black/[0.1] bg-transparent p-0"
          />
          <span className="text-[#78716c] tabular-nums">{gradientFrom}</span>
        </label>
        <label className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-[#78716c]">结束色</span>
          <input
            type="color"
            value={gradientTo}
            onChange={(event) => onGradientToChange(event.target.value)}
            className="size-6 shrink-0 cursor-pointer rounded border border-black/[0.1] bg-transparent p-0"
          />
          <span className="text-[#78716c] tabular-nums">{gradientTo}</span>
        </label>
        <TuningSlider
          label="角度"
          value={gradientAngle}
          min={0}
          max={360}
          step={5}
          unit="°"
          onChange={onGradientAngleChange}
        />
      </div>
      )}
    </TuningPanelShell>
  );
}
