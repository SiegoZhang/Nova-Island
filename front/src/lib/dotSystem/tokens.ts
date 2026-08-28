import type {
  ColorStop,
  FieldColors,
  ImageSampledTuning,
  PointerTrailTuning,
  StippleTier,
} from "./types";

// 点阵设计系统的默认数值——原来分散在 FlowNoiseDots.tsx / EarthStipple.tsx /
// EarthStippleLight.tsx / HeroDotTexture.tsx / HeroFlowBgTexture.tsx /
// HeroCosmosReveal.tsx / VideoDotMatrix.tsx / particle-field/{palette,
// *Mode}.ts 里的模块级常量，现在集中到这一份文件。每个效果组件改成从这里
// import 对应的分组常量，数值本身与迁移前逐条核对一致，不改变默认视觉效果。
//
// 这里的数值同时也是外部调参工具（官网/dot-system-studio）导出结果要粘贴
// 回来替换的目标——所以尽量保持"分组常量 + 一个聚合对象"两种形态都导出，
// 分组常量方便组件按需 import，聚合对象方便整体对照/替换。

export const EARTH_TEXTURE_SRC = "/images/earth.png";

/** 地球贴图采样网格密度（GRID x GRID）——FlowNoiseDots 与 EarthStipple 共用。 */
export const EARTH_SAMPLE_GRID = 100;

// ---- 颜色渐变 --------------------------------------------------------

/** 蓝→白色阶：暗部深蓝，亮部过渡到近白。 */
export const DARK_FLOW_STOPS: ColorStop[] = [
  { stop: 0, rgb: [16, 28, 58] },
  { stop: 0.35, rgb: [30, 70, 160] },
  { stop: 0.65, rgb: [90, 160, 235] },
  { stop: 0.88, rgb: [190, 220, 250] },
  { stop: 1, rgb: [255, 255, 255] },
];
export const DARK_FLOW_BG = "#050608";

/** 白→深蓝色阶：「光电流动」「光电点阵」两个浅色变体共用。 */
export const LIGHT_FLOW_STOPS: ColorStop[] = [
  { stop: 0, rgb: [219, 231, 255] },
  { stop: 0.35, rgb: [147, 181, 255] },
  { stop: 0.65, rgb: [59, 111, 255] },
  { stop: 0.88, rgb: [30, 58, 160] },
  { stop: 1, rgb: [12, 20, 60] },
];
export const LIGHT_FLOW_BG = "#fdfcfc";

/** 疏密点阵（EarthStipple）深底版分档。 */
export const DEFAULT_STIPPLE_TIERS: StippleTier[] = [
  { id: "t1", label: "极浅", minDensity: 0.3, maxDensity: 0.45, radius: 0.07, color: "#8b9096", alpha: 0.32 },
  { id: "t2", label: "浅", minDensity: 0.45, maxDensity: 0.6, radius: 0.11, color: "#aeb4ba", alpha: 0.46 },
  { id: "t3", label: "中", minDensity: 0.6, maxDensity: 0.75, radius: 0.16, color: "#ccd2d7", alpha: 0.6 },
  { id: "t4", label: "深", minDensity: 0.75, maxDensity: 0.9, radius: 0.22, color: "#e4e9ed", alpha: 0.78 },
  { id: "t5", label: "极深", minDensity: 0.9, maxDensity: 1.01, radius: 0.29, color: "#ebf0f5", alpha: 0.92 },
];

/** 疏密点阵白底版分档——原来单独存在 EarthStippleLight.tsx（该组件本身
 * 无任何其他引用者，已删除，只把这份数据迁到这里）。 */
export const LIGHT_STIPPLE_TIERS: StippleTier[] = [
  { id: "t1", label: "极浅", minDensity: 0.3, maxDensity: 0.45, radius: 0.07, color: "#c9c4bd", alpha: 0.4 },
  { id: "t2", label: "浅", minDensity: 0.45, maxDensity: 0.6, radius: 0.11, color: "#a8a29a", alpha: 0.55 },
  { id: "t3", label: "中", minDensity: 0.6, maxDensity: 0.75, radius: 0.16, color: "#78716c", alpha: 0.7 },
  { id: "t4", label: "深", minDensity: 0.75, maxDensity: 0.9, radius: 0.22, color: "#44403c", alpha: 0.85 },
  { id: "t5", label: "极深", minDensity: 0.9, maxDensity: 1.01, radius: 0.29, color: "#1c1917", alpha: 0.96 },
];

/** particle-field 默认三段配色（deep/mid/light + accent）。 */
export const DEFAULT_FIELD_COLORS: FieldColors = {
  background: "#fdfcfc",
  light: [173, 201, 255],
  mid: [83, 129, 240],
  deep: [21, 38, 108],
  accent: [64, 214, 130],
};

// ---- 球体（FlowNoiseDots）---------------------------------------------

export const SPHERE_TUNING = {
  grid: EARTH_SAMPLE_GRID,
  /** 赤道过渡带宽度（归一化）。 */
  edgeBand: 0.07,
  /** excludeZoneId 挖空区域的羽化宽度（css px）。 */
  excludeFeather: 70,
  /** 开场入场动画：错峰延迟上限（ms）。 */
  revealStaggerMax: 650,
  /** 开场入场动画：单点淡入+长大时长（ms）。 */
  revealDuration: 550,
  /** 流动噪声时间推进速度。 */
  timeSpeed: 0.00014,
} as const;

// ---- 疏密点阵（EarthStipple）------------------------------------------

export const STIPPLE_TUNING = {
  grid: EARTH_SAMPLE_GRID,
  edgeBand: 0.07,
  timeSpeed: 0.0006,
} as const;

// ---- Hero 背景纹理（HeroDotTexture）------------------------------------

export const TEXTURE_TUNING = {
  /** 点间距（css px）。 */
  step: 7,
  dotRadius: 2.4,
  /** 团块轮廓噪声频率。 */
  macroScale: 0.0045,
  /** 团块内部疏密噪声频率。 */
  microScale: 0.035,
  maskEdgeLow: -0.32,
  maskEdgeHigh: -0.05,
  maxAlpha: 0.16,
} as const;

/** HeroDotTexture 鼠标发光轨迹。 */
export const TEXTURE_TRAIL_TUNING: PointerTrailTuning & { maxAlpha: number } = {
  lifetimeMs: 750,
  radius: 70,
  minMove: 10,
  maxPoints: 40,
  maxAlpha: 0.5,
};

// ---- Hero 光电晕环纹理（HeroFlowBgTexture）------------------------------

export const FLOW_BG_TEXTURE_TUNING = {
  step: 8,
  dotRadius: 1.5,
  edgeMaskStart: 0.72,
  edgeMaskFeather: 0.16,
  normFloor: 0.08,
  normGamma: 0.9,
  maxAlpha: 0.7,
} as const;

// ---- Hero 宇宙擦洞（HeroCosmosReveal）-----------------------------------

export const COSMOS_REVEAL_TUNING = {
  dotMinRadiusRatio: 0.09,
  dotMaxRadiusRatio: 0.42,
  brightnessFloor: 0.05,
  brightnessGamma: 1.6,
  alphaGain: 2.6,
  minAlpha: 0.03,
  eraseMicroScale: 0.035,
} as const;

/** HeroCosmosReveal 鼠标擦洞轨迹。 */
export const COSMOS_TRAIL_TUNING: PointerTrailTuning & { eraseStep: number; eraseDotRadius: number } = {
  lifetimeMs: 750,
  radius: 70,
  minMove: 10,
  maxPoints: 40,
  eraseStep: 8,
  eraseDotRadius: 2.6,
};

// ---- 视频亮度点阵（VideoDotMatrix）--------------------------------------

export const VIDEO_DOT_MATRIX_DEFAULTS = {
  gridCols: 80,
  gridRows: 80,
  dotMaxSize: 4.2,
  dotMinSize: 0,
  opacityThreshold: 0.14,
  softness: 0.22,
  contrast: 1,
  edgeFadeStart: 0.5,
  colorLow: "#4f7de0",
  colorHigh: "#cbb8f2",
  background: "#ffffff",
  maxAlpha: 1,
  speed: 1,
  /** 方形点占比（0~1），默认 0 表示维持原有的纯圆形点阵。 */
  squareDotRatio: 0,
} as const;

/** VideoDotMatrix 鼠标悬浮"点亮 + 吸附"交互（mouseInteraction）的默认强度。
 * 只在显式开启 mouseInteraction 时生效，不影响其余不传这组参数的调用方。 */
export const VIDEO_DOT_MATRIX_HOVER_DEFAULTS = {
  /** 影响半径（css px，随容器宽度换算成着色器里的归一化空间）。 */
  radiusPx: 170,
  /** 半径内的点被拉向鼠标的位移比例（0~1，相对两者归一化坐标差）。 */
  attract: 0.32,
  /** 叠加到 mask 上的最大提亮量，能让阈值以下本不可见的暗部点也被"点亮"。
   * 从 0.85 调低到 0.5——原值会把暗部点直接拉到接近满可见度，鼠标一靠近
   * 就糊出一片刺眼的高亮团，调低后暗部点也能被点亮，但不会盖过视频本身
   * 的亮度层次。 */
  boost: 0.5,
  /** 悬浮时点直径的额外放大比例，从 0.55 调低到 0.32，配合 boost 一起
   * 收敛"过曝"的观感。 */
  sizeBoost: 0.32,
  /** 悬浮高光颜色跟原色的最大混合比例（0~1）。原来悬浮色直接按 vHover
   * 强度（可到 1）跟 uHoverColor 混合，鼠标正中心的点会被完全染成纯白，
   * 这个上限把"最多染多少"单独拆出来控制，跟点亮/放大互不影响。 */
  colorMix: 0.45,
  /** 鼠标目标位置/强度每帧的插值系数，越大跟手越紧，越小越有"黏滞感"。 */
  smoothing: 0.16,
} as const;

// ---- 图片点阵（ImageDotMatrix，团队卡片背景纹理）------------------------

/** ImageDotMatrix 鼠标悬浮"聚拢"交互（mouseInteraction）的默认强度。只在
 * 显式开启 mouseInteraction 时生效，不影响默认（静态）渲染路径。跟
 * VIDEO_DOT_MATRIX_HOVER_DEFAULTS 是同一套"半径内的点被拉向鼠标"手法，
 * 但这里的点是纯色（不按亮度分渐变色），所以没有 boost/colorMix 这两个跟
 * "点亮暗部/染色"相关的字段。 */
export const IMAGE_DOT_MATRIX_HOVER_DEFAULTS = {
  /** 影响半径（css px）。 */
  radiusPx: 90,
  /** 半径内的点被拉向鼠标的位移比例（0~1，相对点到鼠标的距离）。 */
  attract: 0.38,
  /** 悬浮时点直径的额外放大比例。 */
  sizeBoost: 0.4,
  /** 鼠标目标位置/强度每帧的插值系数，越大跟手越紧，越小越有"黏滞感"。 */
  smoothing: 0.16,
} as const;

// ---- 生成式参考图点阵（particle-field）----------------------------------

/** 6 个 mode 文件原来各自重复写同一组字面量，只有 referenceSrc /
 * expectedMaxDeviation 真正需要按参考图单独校准。 */
export const IMAGE_SAMPLED_DEFAULT_TUNING: ImageSampledTuning = {
  step: 9,
  minRadius: 0.6,
  maxRadius: 4.2,
  maxAlpha: 0.95,
  alphaGamma: 0.6,
};

// ---- AI 社群卡片点阵动画（AiCommunityCarousel / AiCommunitySection）------
//
// 以下六组是 2026-08-26 对首页/AI 社群板块六张点阵卡片当时生效数值的备份
// 快照。FlagVisual / RingSphereDotMatrix / ToolDotMatrix / SalonDotMatrix /
// SphereConnectDotMatrix / NavigatorDotMatrix 这六个组件各自在文件内部维护
// 自己的一份 *_DEFAULTS 常量并从那份读取，不从这里 import——这里只是存档，
// 方便日后调参面板试坏了数值、或误改代码时能对照手动恢复，不是这些组件的
// 实际数据源，改这里不会影响线上效果。
//
// 注：2026-08-27 起六个组件统一改成「灰底纹理 + 少量高光」——片元着色器按
// 亮度在 colorLow→colorGlow 两档灰之间插值形成纹理，仅最亮的一小段染成
// colorHigh（白色）作为高光。当前生效值为
// colorLow #d0d0d0 / colorGlow #e8e8e8 / colorHigh #ffffff（六组一致）；
// 下面快照里的 colorLow/High/Glow 是改版前的旧值，仅供对照。

export const AI_COMMUNITY_DOT_MATRIX_GRID = {
  cols: 74,
  rows: 60,
} as const;

/** 每周风向（FlagVisual），对应组件内 FLAG_DEFAULTS。 */
export const AI_COMMUNITY_FLAG_DEFAULTS_SNAPSHOT = {
  videoSrc: "/videos/daily.mp4",
  density: 1.35,
  dotMaxSize: 5.9,
  dotMinSize: 0,
  opacityThreshold: 0.05,
  softness: 0.02,
  contrast: 1.2,
  edgeFadeStart: 0.5,
  colorLow: "#1a38ce",
  colorHigh: "#d4b6fe",
  colorGlow: "#d4b6ff",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  blurPx: 0,
  rightShiftPercent: 21,
} as const;

/** 超级内容（RingSphereDotMatrix），对应组件内 RING_SPHERE_DEFAULTS。 */
export const AI_COMMUNITY_RING_SPHERE_DEFAULTS_SNAPSHOT = {
  videoSrc: "/videos/ring-sphere.mp4",
  density: 1.25,
  dotMaxSize: 5.9,
  dotMinSize: 0,
  opacityThreshold: 0.05,
  softness: 0.02,
  contrast: 0.85,
  keyColor: "#0069e8",
  keyThreshold: 0.25,
  keySoftness: 0.15,
  edgeFadeStart: 0.5,
  colorLow: "#e1ed63",
  colorHigh: "#d4b6ff",
  colorGlow: "#e1ed63",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  rightShiftPercent: 22,
  sizePercent: 66,
} as const;

/** 工具教程（ToolDotMatrix），对应组件内 TOOL_DEFAULTS。 */
export const AI_COMMUNITY_TOOL_DEFAULTS_SNAPSHOT = {
  videoSrc: "/videos/tool.mp4",
  density: 1.25,
  dotMaxSize: 7.9,
  dotMinSize: 0,
  opacityThreshold: 0,
  softness: 0.02,
  contrast: 0.5,
  keyColor: "#000000",
  keyThreshold: 0.52,
  keySoftness: 0.02,
  edgeFadeStart: 0.5,
  colorLow: "#d4b6fe",
  colorHigh: "#e1ed63",
  colorGlow: "#d4b6ff",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  blurPx: 0,
  rightShiftPercent: 25,
  sizePercent: 51,
} as const;

/** 精选沙龙（SalonDotMatrix），对应组件内 SALON_DEFAULTS。 */
export const AI_COMMUNITY_SALON_DEFAULTS_SNAPSHOT = {
  videoSrc: "/videos/salon.mp4",
  density: 1.1,
  dotMaxSize: 6.6,
  dotMinSize: 0,
  opacityThreshold: 0.05,
  softness: 0.02,
  contrast: 1,
  keyColor: "#1d20d7",
  keyThreshold: 0.29,
  keySoftness: 0.15,
  edgeFadeStart: 0.5,
  colorLow: "#1a38ce",
  colorHigh: "#d4b6ff",
  colorGlow: "#d4b6ff",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 0.7,
  rightShiftPercent: 24,
  sizePercent: 61,
} as const;

/** 同频集会（SphereConnectDotMatrix），对应组件内 SPHERE_CONNECT_DEFAULTS。 */
export const AI_COMMUNITY_SPHERE_CONNECT_DEFAULTS_SNAPSHOT = {
  videoSrc: "/videos/spheres.mp4",
  density: 1.5,
  dotMaxSize: 4.8,
  dotMinSize: 0,
  opacityThreshold: 0.23,
  softness: 0.02,
  contrast: 1.95,
  edgeFadeStart: 0.5,
  colorLow: "#d4b6ff",
  colorHigh: "#e1ed63",
  colorGlow: "#e1ed63",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 0.6,
  blurPx: 0,
  rightShiftPercent: 33,
} as const;

/** 成为领航员（NavigatorDotMatrix），对应组件内 NAVIGATOR_DEFAULTS。 */
export const AI_COMMUNITY_NAVIGATOR_DEFAULTS_SNAPSHOT = {
  videoSrc: "/videos/navigator.mp4",
  density: 1.8,
  dotMaxSize: 4.6,
  dotMinSize: 0,
  opacityThreshold: 0.05,
  softness: 0.5,
  contrast: 1.4,
  edgeFadeStart: 0.5,
  colorLow: "#1a38ce",
  colorHigh: "#d4b6ff",
  colorGlow: "#e1ed63",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  blurPx: 0,
  rightShiftPercent: 16,
} as const;

/** 六张卡片快照的聚合对象，方便整体对照/搜索。同上，仅作备份存档，组件不
 *  从这里读取。 */
export const AI_COMMUNITY_DOT_MATRIX_SNAPSHOT = {
  grid: AI_COMMUNITY_DOT_MATRIX_GRID,
  flag: AI_COMMUNITY_FLAG_DEFAULTS_SNAPSHOT,
  ringSphere: AI_COMMUNITY_RING_SPHERE_DEFAULTS_SNAPSHOT,
  tool: AI_COMMUNITY_TOOL_DEFAULTS_SNAPSHOT,
  salon: AI_COMMUNITY_SALON_DEFAULTS_SNAPSHOT,
  sphereConnect: AI_COMMUNITY_SPHERE_CONNECT_DEFAULTS_SNAPSHOT,
  navigator: AI_COMMUNITY_NAVIGATOR_DEFAULTS_SNAPSHOT,
} as const;

// ---- 聚合导出 ----------------------------------------------------------

/** 供整体查看/未来与外部调参工具的导出结果对照的聚合对象。组件内部仍然
 * import 上面各自的分组常量，不必依赖这个聚合对象。 */
export const DEFAULT_DOT_TOKENS = {
  earthTextureSrc: EARTH_TEXTURE_SRC,
  earthSampleGrid: EARTH_SAMPLE_GRID,
  colors: {
    darkFlowStops: DARK_FLOW_STOPS,
    darkFlowBg: DARK_FLOW_BG,
    lightFlowStops: LIGHT_FLOW_STOPS,
    lightFlowBg: LIGHT_FLOW_BG,
    darkStippleTiers: DEFAULT_STIPPLE_TIERS,
    lightStippleTiers: LIGHT_STIPPLE_TIERS,
    fieldColors: DEFAULT_FIELD_COLORS,
  },
  sphere: SPHERE_TUNING,
  stipple: STIPPLE_TUNING,
  texture: TEXTURE_TUNING,
  textureTrail: TEXTURE_TRAIL_TUNING,
  flowBgTexture: FLOW_BG_TEXTURE_TUNING,
  cosmosReveal: COSMOS_REVEAL_TUNING,
  cosmosTrail: COSMOS_TRAIL_TUNING,
  videoDotMatrix: VIDEO_DOT_MATRIX_DEFAULTS,
  imageDotMatrixHover: IMAGE_DOT_MATRIX_HOVER_DEFAULTS,
  imageSampled: IMAGE_SAMPLED_DEFAULT_TUNING,
} as const;
