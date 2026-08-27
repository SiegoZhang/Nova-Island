"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import {
  createVisibilityLifecycle,
  getClampedDpr,
  manageVideoElement,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";
import {
  VIDEO_DOT_MATRIX_DEFAULTS,
  VIDEO_DOT_MATRIX_HOVER_DEFAULTS,
} from "@/lib/dotSystem/tokens";

// 用 Three.js + GLSL 把一段循环 3D 视频转成规则点阵：视频只当纹理输入，
// 从不直接显示。网格本身固定不动（80x80，均匀分布、严格对齐），每一帧
// 只在顶点着色器里按该格子对应的视频亮度实时调整这一个点的 size 和
// opacity——亮部点更大更清晰，暗部点收缩并淡出直至消失。网格不动、只有
// 亮度信息在网格里流动，配合原视频里 3D 物体本身的旋转和明暗变化，
// 才会看起来像一整块点阵在跟着一个 3D 物体转动，而不是粒子在飞。
//
// 视频分辨率远高于 80x80 的采样密度，如果直接在着色器里对原始视频纹理
// 逐点采样，等于稀疏点采样一张高频细节的图，会产生规则的摩尔纹/条纹
// 伪影（而不是视频本身的形状）。GPU 的 generateMipmap 对某些视频纹理的
// 内部格式在部分驱动上直接报错拒绝生成，不可靠。这里改为每帧先把视频
// 画到一张和网格同分辨率（gridCols x gridRows）的离屏 2D canvas 上——
// object-fit: cover 的裁切换算也在这一步完成——浏览器的画布缩放本身就是
// 面积平均，天然起到和"每格取平均亮度"等价的抗锯齿效果。这张小 canvas
// 才是最终喂给 GLSL 顶点着色器的纹理，着色器仍然是实时逐点采样、驱动
// size/opacity 的那一路。

type RampStop = { stop: number; hex: string };

function hexToRgb255(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// 把多段色阶烤成一张 256×1 的查找贴图：顶点着色器算出的亮度(0~1)直接拿去
// 采样就得到对应的渐变色，替代原来 mix(colorLow, colorHigh) 的两端线性过渡。
// 色标之间按 sRGB 分量线性插值——跟 lib/dotSystem/colorRamp.ts 的 colorAt、
// dot-system-studio 里的同名函数是同一种插值，方便三处对齐数值。贴图标成
// SRGBColorSpace，让 three 采样时转成线性工作空间，跟之前直接传 THREE.Color
// uniform 的行为一致，不会整体偏亮/偏暗。
function buildRampTexture(stops: RampStop[]): THREE.DataTexture {
  const width = 256;
  const data = new Uint8Array(width * 4);
  const sorted = [...stops].sort((a, b) => a.stop - b.stop);
  const rgb = sorted.map((s) => hexToRgb255(s.hex));
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    let a = 0;
    while (a < sorted.length - 2 && t > sorted[a + 1].stop) a++;
    const b = Math.min(a + 1, sorted.length - 1);
    const span = sorted[b].stop - sorted[a].stop || 1;
    const lt = Math.min(1, Math.max(0, (t - sorted[a].stop) / span));
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = Math.round(rgb[a][c] + (rgb[b][c] - rgb[a][c]) * lt);
    }
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const VERTEX_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uPixelRatio;
  uniform float uDotMin;
  uniform float uDotMax;
  uniform float uThreshold;
  uniform float uSoftness;
  uniform float uContrast;
  uniform float uFadeStart;
  uniform float uAppearProgress;
  uniform float uScatter;
  // 颜色越浅(亮度越高)点越小 + 每点随机尺寸抖动——都默认 0，不影响
  // 其余调用方原本"越亮越大、同区域点大小一致"的行为。
  uniform float uHighlightShrink;
  uniform float uHighlightShrinkStart;
  uniform float uSizeJitter;

  // 鼠标悬浮"点亮 + 吸附"：uHoverStrength 是整体强度（进入/离开容器时在
  // JS 里做插值淡入淡出，不是硬开关），uMouse 是鼠标在同一套归一化容器
  // 空间（-0.5~0.5）里的位置，uAspect 是容器宽高比——x/y 两个方向各自
  // 独立按宽度/高度归一化，非正方形容器下不做宽高比修正的话，圆形悬浮
  // 范围在屏幕上会被拉成椭圆，所以算距离时把 y 分量除以 uAspect 校正回
  // 与 x 同一把尺子。
  uniform vec2 uMouse;
  uniform float uMouseRadius;
  uniform float uAspect;
  uniform float uHoverStrength;
  uniform float uHoverAttract;
  uniform float uHoverBoost;
  uniform float uHoverSizeBoost;

  attribute vec2 aUv;
  attribute float aSeed;
  // 每个点固定的形状标记（0=圆形，1=方形），挂载时按 squareDotRatio 随机
  // 分配好、写死进 buffer，不随帧变化——同一个点从始至终都是同一种形状，
  // 不会闪烁切换。
  attribute float aShape;

  varying float vLuminance;
  varying float vMask;
  varying float vAppear;
  varying float vHover;
  varying float vShape;

  void main() {
    vec3 texel = texture2D(uTexture, aUv).rgb;
    float luminance = dot(texel, vec3(0.299, 0.587, 0.114));

    // 以 0.5 为轴心拉伸对比度：uContrast=1 不变，>1 让暗部更暗、亮部更亮，
    // 波峰和背景（波谷/平面）的亮度差被放大，阈值裁剪后波峰轮廓更干净。
    luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

    float mask = smoothstep(uThreshold, uThreshold + uSoftness, luminance);

    // 空间柔化：以点在归一化容器空间（-0.5~0.5）里离中心的距离做遮罩，
    // 越靠边缘越淡，让整片点阵像悬浮在空白背景里的一块区域，而不是把
    // 容器四角也铺满。uFadeStart 是遮罩开始收缩的位置（0~0.5，越小收缩
    // 范围越大）；uFadeStart 取满 0.5 时几乎不收缩，等价于关闭这个效果。
    vec2 edge = abs(position.xy);
    float fadeX = 1.0 - smoothstep(uFadeStart, 0.5, edge.x);
    float fadeY = 1.0 - smoothstep(uFadeStart, 0.5, edge.y);
    mask *= fadeX * fadeY;

    // 鼠标越近，hover 越接近 1；平方一下让核心区域更集中、边缘衰减更快，
    // 观感上更像"被吸住"而不是均匀一整片变亮。
    vec2 toMouse = uMouse - position.xy;
    vec2 distVec = vec2(toMouse.x, toMouse.y / uAspect);
    float hover = uHoverStrength * (1.0 - smoothstep(0.0, max(0.0001, uMouseRadius), length(distVec)));
    hover = hover * hover;
    vHover = hover;

    // 暗部/阈值以下本来完全不可见的点，鼠标靠近时也能被直接"点亮"——
    // 用 max 而不是叠加，避免本来就亮的点因为鼠标经过反而过曝。
    mask = max(mask, hover * uHoverBoost);

    vLuminance = luminance;
    vMask = mask;
    vShape = aShape;

    // 吸附位移：只挪动渲染用的位置，不改 aUv/采样逻辑，所以视频纹理内容
    // 不受影响，纯粹是点本身的位置被"吸"向鼠标一段距离。
    vec3 displaced = position + vec3(toMouse * hover * uHoverAttract, 0.0);
    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // 入场动画：每个点按自己的随机种子 aSeed 错开起跳时间。uScatter=0 时
    // 所有点的起跳时间都是 0，跟 uAppearProgress 完全同步，整片同时长大；
    // uScatter 越接近 1，起跳时间越分散（最晚的点要等 uAppearProgress 快
    // 到 1 才开始长大），效果是点一个一个陆续冒出来而不是整片一起出现。
    // 不管 uScatter 取多少，所有点都在 uAppearProgress=1 时刚好长到 100%，
    // 两层只要传同一个时长，视觉上就会同时完成入场。
    float localStart = aSeed * uScatter;
    float localSpan = max(0.0001, 1.0 - uScatter);
    float appear = clamp((uAppearProgress - localStart) / localSpan, 0.0, 1.0);
    appear = appear * appear * (3.0 - 2.0 * appear);
    vAppear = appear;

    // 尺寸遮罩在可见遮罩(mask)基础上，再按亮度收一道：luminance 从
    // uHighlightShrinkStart 到 1，尺寸系数从 1 线性(smoothstep)降到
    // (1 - uHighlightShrink)。只影响点径，不动 vMask/alpha，所以浅色处
    // 的点是"变小"而不是"变淡"。uHighlightShrink=0 时完全等价于原来。
    float sizeMask = mask * (1.0 - uHighlightShrink * smoothstep(uHighlightShrinkStart, 1.0, luminance));
    // 每点按随机种子做尺寸抖动：只缩不放(1-uSizeJitter*aSeed ∈ [1-j,1])，
    // 避免点相互重叠，同时让同一片区域的点大小不再整齐划一。
    float size = mix(uDotMin, uDotMax, sizeMask) * appear * (1.0 - uSizeJitter * aSeed);
    size *= 1.0 + hover * uHoverSizeBoost;
    gl_PointSize = size * uPixelRatio;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform sampler2D uRamp;
  uniform vec3 uHoverColor;
  uniform float uHoverColorMix;
  uniform float uMaxAlpha;

  varying float vLuminance;
  varying float vMask;
  varying float vAppear;
  varying float vHover;
  varying float vShape;

  void main() {
    if (vMask < 0.003) discard;

    // 圆形用欧氏距离（到中心的直线距离），方形用切比雪夫距离（x/y 分量
    // 里较大的那个，等价于到最近正方形边的距离）——同一套 smoothstep
    // 阈值（0.32~0.5）套在两种距离度量上，分别刻出软边圆形和软边方形，
    // vShape 是挂载时按 aShape 写死的 0/1，按点混合两种遮罩，不会
    // 出现"半圆半方"的中间形态。
    vec2 centered = gl_PointCoord - vec2(0.5);
    float circleDist = length(centered);
    float squareDist = max(abs(centered.x), abs(centered.y));
    float dist = mix(circleDist, squareDist, vShape);
    float shape = 1.0 - smoothstep(0.32, 0.5, dist);
    if (shape <= 0.0) discard;

    vec3 color = texture2D(uRamp, vec2(clamp(vLuminance, 0.0, 1.0), 0.5)).rgb;
    // 悬浮高光：往 uHoverColor 混一部分，hover 越强（离鼠标越近）混得
    // 越多，跟"点亮"的位置/尺寸变化叠在一起，形成鼠标附近一小片更亮
    // 更清晰的高光区域。乘上 uHoverColorMix 封顶最大混合比例，避免鼠标
    // 正中心的点被完全染成纯色、糊成一片刺眼的高亮团。
    color = mix(color, uHoverColor, clamp(vHover, 0.0, 1.0) * uHoverColorMix);
    float alpha = shape * vMask * uMaxAlpha * vAppear;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface VideoDotMatrixProps {
  /** 视频源（public 目录下的路径），需已裁成无缝循环 */
  src: string;
  className?: string;
  /** 网格列数，默认 80 */
  gridCols?: number;
  /** 网格行数，默认 80 */
  gridRows?: number;
  /** 最亮处的点直径（css px） */
  dotMaxSize?: number;
  /** 最暗处（未到阈值前）的点直径（css px），通常为 0 表示完全消失 */
  dotMinSize?: number;
  /** 低于该亮度（0~1）的点完全不显示 */
  opacityThreshold?: number;
  /** 阈值到完全显现之间的过渡宽度（0~1），越大过渡越柔和 */
  softness?: number;
  /** 亮度对比度，以 0.5 为轴心拉伸，1 = 不变，越大波峰与背景差异越明显 */
  contrast?: number;
  /**
   * 边缘空间柔化：点阵离容器中心多远（0~0.5，对应归一化容器空间的半
   * 宽/半高）开始收缩淡出，到 0.5（容器边缘）完全消失。默认 0.5 表示
   * 只有最外一圈点会收缩，等价于关闭这个效果；调小可以让整片点阵像
   * 悬浮在空白背景里，不铺满整个容器。
   */
  edgeFadeStart?: number;
  /** 暗部→亮部渐变色的起点（低亮度），柔和蓝色。不传 colorStops 时用作
   *  兜底色阶的 0 端。 */
  colorLow?: string;
  /** 暗部→亮部渐变色的终点（高亮度），淡紫色。不传 colorStops 时用作
   *  兜底色阶的 1 端；始终作为 hoverColor 的默认值。 */
  colorHigh?: string;
  /**
   * 多段色阶：按每个点的亮度(0~1)在这条渐变里取色，替代 colorLow→colorHigh
   * 的两色线性过渡。不传（默认）就用 [colorLow@0, colorHigh@1] 两段兜底，
   * 视觉跟原来完全一致——其余调用方（AI 社群卡片、/ai 页、联系我们）不受
   * 影响。跟其它参数一样只在挂载时读取一次，运行期改动靠父组件换 key 重挂载。
   */
  colorStops?: RampStop[];
  /**
   * 颜色越浅（亮度越高）的点越小：0（默认）保持原有"越亮越大"的行为不变；
   * 取 0~1，到最亮处点直径最多缩到 (1 - highlightShrink) 倍。收缩从
   * highlightShrinkStart 亮度开始。只影响点径，不改点的可见度/透明度。
   */
  highlightShrink?: number;
  /** highlightShrink 开始生效的亮度阈值（0~1），默认 0.6。 */
  highlightShrinkStart?: number;
  /**
   * 每个点按随机种子做的尺寸抖动幅度（0~0.9），默认 0（同区域点大小一致）。
   * 只缩不放（避免点相互重叠）：取 0.3 时点直径随机落在计算值的 70%~100%。
   */
  sizeJitter?: number;
  /** 画布背景色 */
  background?: string;
  /** 峰值不透明度上限（0~1），默认 1 表示不额外衰减，保持原有效果不变 */
  maxAlpha?: number;
  /** 视频播放速度倍率，默认 1（原生速度） */
  speed?: number;
  /**
   * 方形点占比（0~1），默认 0 表示维持原有的纯圆形点阵（不影响其余不传
   * 这个参数的地方）。设为例如 0.5，会在挂载时按这个比例随机把约一半的
   * 点固定标记成方形、另一半保持圆形，形成"圆形点阵和方形点阵混杂"的
   * 效果；每个点的形状挂载后固定不变，不会逐帧闪烁切换。
   */
  squareDotRatio?: number;
  /**
   * 画布背景改为透明（WebGL alpha 通道 + 清屏 alpha 0），而不是铺
   * `background` 这个不透明底色。用于把这一层叠在别的点阵/背景之上，
   * 点与点之间的空隙能透出下面的内容。默认 false，保持原有不透明背景，
   * 不影响 AI 社群区块、/ai 页等其余用到这个组件的地方。
   */
  transparentBackground?: boolean;
  /**
   * 入场动画时长（ms）。不传（默认）就不做入场动画，点从第一帧起就是
   * 完全体，跟原有行为完全一致——AI 社群区块、/ai 页等其余用到这个组件
   * 的地方不受影响。传了之后，点阵会从全隐从 0 长到 100%。
   */
  entranceDurationMs?: number;
  /**
   * 入场时点与点之间起跳时间的错落程度，0~1，默认 0（所有点同步长大）。
   * 越接近 1，点的出现时间越分散，看起来像"陆续零散地冒出来"而不是整
   * 片一起变大——具体机制见 VERTEX_SHADER 里 uScatter 的注释。
   */
  entranceScatter?: number;
  /** 入场动画完全结束（所有点都长到 100%）时触发一次，只触发一次。 */
  onEntranceComplete?: () => void;
  /**
   * 是否开启鼠标悬浮"点亮 + 吸附"效果：鼠标靠近时，附近的点会被提亮
   * （暗部/阈值以下原本不可见的点也能被点亮）、放大，并轻微朝鼠标位置
   * 偏移，形成"被吸过去"的观感。默认 false，不影响其余不需要交互的
   * 场景（AI 社群区块、/ai 页等）。会在 window 上监听 pointermove 判断
   * 鼠标是否落在容器范围内，不依赖画布自身的 pointer-events（画布可以
   * 继续保持 pointer-events: none，让点击穿透到下层内容/文案）。
   */
  mouseInteraction?: boolean;
  /** 悬浮影响半径（css px），默认见 VIDEO_DOT_MATRIX_HOVER_DEFAULTS.radiusPx */
  hoverRadiusPx?: number;
  /** 悬浮时点被拉向鼠标的位移比例（0~1），默认见 …HOVER_DEFAULTS.attract */
  hoverAttract?: number;
  /** 悬浮时叠加到 mask 上的最大提亮量（0~1），默认见 …HOVER_DEFAULTS.boost */
  hoverBoost?: number;
  /** 悬浮时点直径的额外放大比例，默认见 …HOVER_DEFAULTS.sizeBoost */
  hoverSizeBoost?: number;
  /** 悬浮高光颜色，跟当前点的渐变色混合；不传则使用 colorHigh */
  hoverColor?: string;
  /** 悬浮高光颜色的最大混合比例（0~1），默认见 …HOVER_DEFAULTS.colorMix */
  hoverColorMix?: number;
}

// 默认色值/尺寸/网格密度收在 lib/dotSystem/tokens.ts（VIDEO_DOT_MATRIX_DEFAULTS）
// 统一维护，这里只做局部别名，数值不变。
const DEFAULTS = VIDEO_DOT_MATRIX_DEFAULTS;
const HOVER_DEFAULTS = VIDEO_DOT_MATRIX_HOVER_DEFAULTS;

export function VideoDotMatrix({
  src,
  className,
  gridCols = DEFAULTS.gridCols,
  gridRows = DEFAULTS.gridRows,
  dotMaxSize = DEFAULTS.dotMaxSize,
  dotMinSize = DEFAULTS.dotMinSize,
  opacityThreshold = DEFAULTS.opacityThreshold,
  softness = DEFAULTS.softness,
  contrast = DEFAULTS.contrast,
  edgeFadeStart = DEFAULTS.edgeFadeStart,
  colorLow = DEFAULTS.colorLow,
  colorHigh = DEFAULTS.colorHigh,
  colorStops,
  highlightShrink = 0,
  highlightShrinkStart = 0.6,
  sizeJitter = 0,
  background = DEFAULTS.background,
  maxAlpha = DEFAULTS.maxAlpha,
  speed = DEFAULTS.speed,
  squareDotRatio = DEFAULTS.squareDotRatio,
  transparentBackground = false,
  entranceDurationMs,
  entranceScatter = 0,
  onEntranceComplete,
  mouseInteraction = false,
  hoverRadiusPx = HOVER_DEFAULTS.radiusPx,
  hoverAttract = HOVER_DEFAULTS.attract,
  hoverBoost = HOVER_DEFAULTS.boost,
  hoverSizeBoost = HOVER_DEFAULTS.sizeBoost,
  hoverColor,
  hoverColorMix = HOVER_DEFAULTS.colorMix,
}: VideoDotMatrixProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = prefersReducedMotion();

    const video = document.createElement("video");
    // src 赋值 / loop / muted / playsInline / preload 及加载时机交给
    // manageVideoElement（见下方）统一管，这里只留组件自己关心的 playbackRate。
    video.playbackRate = Math.min(4, Math.max(0.1, speed));
    // 视频只当纹理源，画面本身从不显示——但仍然真的挂进 DOM（1x1、
    // opacity:0、pointer-events:none 藏起来，不能用 display:none，那样
    // 部分浏览器会直接跳过解码），而不是停留在 document.createElement
    // 之后从未插入的"游离态"，这是更规范的写法。
    video.style.position = "absolute";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.setAttribute("aria-hidden", "true");
    container.appendChild(video);

    // 离屏采样画布：分辨率固定等于网格密度，每帧把视频按 cover 裁切画
    // 进来，画布缩放自带的面积平均相当于给每个格子取了区域亮度均值。
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = gridCols;
    sampleCanvas.height = gridRows;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: false });

    const texture = new THREE.CanvasTexture(sampleCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;

    // 亮度→颜色的查找贴图：传了 colorStops 就用多段色阶，否则退回
    // [colorLow, colorHigh] 两段，跟改造前的两色线性 mix 完全等价。
    const rampTexture = buildRampTexture(
      colorStops && colorStops.length >= 2
        ? colorStops
        : [
            { stop: 0, hex: colorLow },
            { stop: 1, hex: colorHigh },
          ],
    );

    const pointCount = gridCols * gridRows;
    const positions = new Float32Array(pointCount * 3);
    const uvs = new Float32Array(pointCount * 2);
    // 每个点一个随机种子，只用来给入场动画错开起跳时间（uScatter），跟点
    // 阵本身的渲染逻辑无关；不传 entranceDurationMs 时这个 attribute 存在
    // 但完全不影响结果（uAppearProgress 恒为 1，appear 恒为 1）。
    const seeds = new Float32Array(pointCount);
    // 每个点固定的形状（0=圆形，1=方形），按 squareDotRatio 随机分配，
    // 挂载后写死不变——见 aShape/vShape 的着色器注释。
    const shapes = new Float32Array(pointCount);
    const clampedSquareRatio = Math.min(1, Math.max(0, squareDotRatio));

    // 点的世界坐标和它们在采样画布上的 uv 都只在挂载时算一次——网格本身
    // 永远均匀、固定，cover 裁切只发生在"画到 sampleCanvas"这一步，
    // 不会影响网格排列。
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const idx = row * gridCols + col;
        const nx = (col + 0.5) / gridCols;
        const ny = (row + 0.5) / gridRows;
        positions[idx * 3 + 0] = nx - 0.5;
        positions[idx * 3 + 1] = 0.5 - ny;
        positions[idx * 3 + 2] = 0;
        uvs[idx * 2 + 0] = nx;
        uvs[idx * 2 + 1] = 1 - ny;
        seeds[idx] = Math.random();
        shapes[idx] = Math.random() < clampedSquareRatio ? 1 : 0;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aUv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute("aShape", new THREE.BufferAttribute(shapes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uPixelRatio: { value: 1 },
        uDotMin: { value: dotMinSize },
        uDotMax: { value: dotMaxSize },
        uThreshold: { value: opacityThreshold },
        uSoftness: { value: softness },
        uContrast: { value: contrast },
        // 钳制在 0.5 以内，保证 smoothstep(uFadeStart, 0.5, x) 的两个边界
        // 不会相等甚至反转。
        uFadeStart: { value: Math.min(0.499, Math.max(0, edgeFadeStart)) },
        uRamp: { value: rampTexture },
        uMaxAlpha: { value: maxAlpha },
        // 没传 entranceDurationMs，或者用户偏好减少动效：直接从"完全体"
        // 起步，不做入场动画——保持原有行为 / 尊重可访问性设置。
        uAppearProgress: { value: entranceDurationMs && !reduceMotion ? 0 : 1 },
        uScatter: { value: Math.min(0.98, Math.max(0, entranceScatter)) },
        uHighlightShrink: { value: Math.min(1, Math.max(0, highlightShrink)) },
        uHighlightShrinkStart: { value: Math.min(0.99, Math.max(0, highlightShrinkStart)) },
        uSizeJitter: { value: Math.min(0.9, Math.max(0, sizeJitter)) },
        // 悬浮点亮/吸附：uHoverStrength 初始为 0（没有交互时完全不影响
        // 原有效果），mouseInteraction=false 或减少动效偏好下永远保持 0，
        // 相关监听器也直接不挂载。
        uMouse: { value: new THREE.Vector2(0, 0) },
        uMouseRadius: { value: 0 },
        uAspect: { value: 1 },
        uHoverStrength: { value: 0 },
        uHoverAttract: { value: Math.max(0, hoverAttract) },
        uHoverBoost: { value: Math.max(0, hoverBoost) },
        uHoverSizeBoost: { value: Math.max(0, hoverSizeBoost) },
        uHoverColor: { value: new THREE.Color(hoverColor ?? colorHigh) },
        uHoverColorMix: { value: Math.min(1, Math.max(0, hoverColorMix)) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geometry, material);

    const scene = new THREE.Scene();
    scene.add(points);

    // 正交相机：1 世界单位 = 1 个容器高度，网格坐标就是 -0.5~0.5 的归一化
    // 平面，resize 时只需要重设视锥体宽高比，点的世界坐标本身永远不变。
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: transparentBackground,
    });
    renderer.setClearColor(new THREE.Color(background), transparentBackground ? 0 : 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    let raf = 0;
    let running = false;
    let width = 0;
    let height = 0;
    let isVisible = true;
    // 入场动画的计时起点在视频真正就绪（handleLoadedMetadata）时才设置，
    // 不是挂载时就起算——这样入场动画的观感时长不会被网络/解码延迟拖长，
    // 两层只要传相同的 entranceDurationMs，各自都是从"自己视频就绪"那刻
    // 起跳，通常同一帧内先后加载完，观感上就是同时开始、同时结束。
    let entranceStart = 0;
    let entranceComplete = !entranceDurationMs || reduceMotion;
    let entranceCompleteFired = false;

    function fireEntranceCompleteOnce() {
      if (entranceCompleteFired) return;
      entranceCompleteFired = true;
      onEntranceComplete?.();
    }
    // 挂载时第一次量出来的容器宽度，作为 dotMinSize/dotMaxSize 这两个绝对
    // px 值的"基准宽度"——网格坐标固定写死在 -0.5~0.5 的归一化空间，容器
    // 越宽，同样的网格数在屏幕上摊得越开、格距越大，但点的 css px 直径是
    // 写死的常量，不会跟着变。响应式布局下容器宽度随视口变化（比如 Hero
    // 区域窄屏时会小于 1280px），点距/点径的比例就会跟着容器宽度漂移——
    // 每次 resize 都按"当前宽度 ÷ 基准宽度"重新缩放点径，让点相对格子的
    // 占比不随窗口大小变化。
    let referenceWidth = 0;

    // 鼠标悬浮状态：target* 是 pointermove 里直接写入的"目标值"，current*
    // 是每帧朝 target 插值逼近后的"当前值"，二者分开是为了让鼠标移动/
    // 进入离开容器时有一小段跟手的缓冲（黏滞感），而不是瞬间跳变。
    const hoverEnabled = mouseInteraction && !reduceMotion;
    let hoverTargetActive = 0;
    let hoverCurrentActive = 0;
    let hoverTargetX = 0;
    let hoverTargetY = 0;
    let hoverCurrentX = 0;
    let hoverCurrentY = 0;

    function handlePointerMove(event: PointerEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const inside =
        rect.width > 0 &&
        rect.height > 0 &&
        localX >= 0 &&
        localX <= rect.width &&
        localY >= 0 &&
        localY <= rect.height;
      if (inside) {
        hoverTargetX = localX / rect.width - 0.5;
        hoverTargetY = 0.5 - localY / rect.height;
        hoverTargetActive = 1;
      } else {
        hoverTargetActive = 0;
      }
    }

    function handlePointerLeaveWindow() {
      hoverTargetActive = 0;
    }

    if (hoverEnabled) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      // 鼠标离开整个窗口（切到别的应用/标签页）时也要收起悬浮效果，不然
      // 最后一次 pointermove 落在容器内的话，效果会一直"卡"在那个位置。
      window.addEventListener("blur", handlePointerLeaveWindow);
      document.addEventListener("pointerleave", handlePointerLeaveWindow);
    }

    function updateHover() {
      if (!hoverEnabled) return;
      const smoothing = HOVER_DEFAULTS.smoothing;
      hoverCurrentActive += (hoverTargetActive - hoverCurrentActive) * smoothing;
      hoverCurrentX += (hoverTargetX - hoverCurrentX) * smoothing;
      hoverCurrentY += (hoverTargetY - hoverCurrentY) * smoothing;
      material.uniforms.uHoverStrength.value = hoverCurrentActive;
      (material.uniforms.uMouse.value as THREE.Vector2).set(hoverCurrentX, hoverCurrentY);
    }

    // 按 object-fit: cover 的方式把视频裁进采样画布——网格本身在容器里
    // 始终均匀铺满，变的只是画布取视频的哪一块区域，这样视频不会被
    // 拉伸变形，网格排列也不受视频宽高比影响。
    function drawSample() {
      if (!sampleCtx) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh || width <= 0 || height <= 0) return;

      const containerAspect = width / height;
      const videoAspect = vw / vh;

      let sx = 0;
      let sy = 0;
      let sw = vw;
      let sh = vh;
      if (containerAspect > videoAspect) {
        sh = vw / containerAspect;
        sy = (vh - sh) / 2;
      } else {
        sw = vh * containerAspect;
        sx = (vw - sw) / 2;
      }

      sampleCtx.drawImage(video, sx, sy, sw, sh, 0, 0, gridCols, gridRows);
      texture.needsUpdate = true;
    }

    function resize() {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      if (width <= 0 || height <= 0) return;

      if (referenceWidth === 0) referenceWidth = width;
      const sizeScale = width / referenceWidth;
      material.uniforms.uDotMin.value = dotMinSize * sizeScale;
      material.uniforms.uDotMax.value = dotMaxSize * sizeScale;

      const dpr = getClampedDpr();
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      material.uniforms.uPixelRatio.value = dpr;

      // 悬浮半径/宽高比按当前容器尺寸实时换算（不是只在挂载时算一次）：
      // uMouseRadius 用"x 方向归一化单位"表示（见 VERTEX_SHADER 里的
      // 换算注释），随容器变窄变宽会自动跟着调整，保证屏幕上的悬浮范围
      // 始终约等于 hoverRadiusPx。
      material.uniforms.uAspect.value = width / height;
      material.uniforms.uMouseRadius.value = hoverRadiusPx / width;

      // 点的位置固定写死在 -0.5~0.5 的归一化容器空间（x 对应宽度，y 对应
      // 高度），相机视锥体必须原样贴合这个范围、不按宽高比缩放——非正方形
      // 的视口会把这个正方形 NDC 区间非均匀拉伸铺满整个矩形画布，这正是
      // 我们想要的效果：网格永远填满整个容器，而不是被挤在中间。
      camera.left = -0.5;
      camera.right = 0.5;
      camera.top = 0.5;
      camera.bottom = -0.5;
      camera.updateProjectionMatrix();

      renderOnce();
    }

    function renderOnce() {
      if (!entranceComplete && entranceStart > 0 && entranceDurationMs) {
        const t = Math.min(1, (performance.now() - entranceStart) / entranceDurationMs);
        material.uniforms.uAppearProgress.value = t;
        if (t >= 1) {
          entranceComplete = true;
          fireEntranceCompleteOnce();
        }
      }
      updateHover();
      drawSample();
      renderer.render(scene, camera);
    }

    function frame() {
      managedVideo.tick();
      renderOnce();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduceMotion || !isVisible) return;
      // play() 每次都重发——它幂等，且负责把"之前被拒/被打断的播放"补上。
      managedVideo.play();
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      managedVideo.pause();
    }

    const managedVideo = manageVideoElement(video, {
      src,
      onReady: () => {
        if (entranceDurationMs && !reduceMotion && entranceStart === 0) {
          entranceStart = performance.now();
        } else if (entranceDurationMs && reduceMotion) {
          // 减少动效：不播放入场动画，直接摆到终态，但完成回调还是要触发一次，
          // 不然依赖它做时序（比如文案要等点阵入场完才淡入）的地方会卡住。
          fireEntranceCompleteOnce();
        }
        renderOnce();
        start();
      },
      onError: () => {
        // 反复重试仍失败：入场动画的完成回调也得触发，别把依赖它的时序卡死；
        // 再把背景色画出来兜底。
        if (entranceDurationMs) fireEntranceCompleteOnce();
        renderOnce();
      },
    });

    resize();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);

    // isVisible 反映"当前是否应该播放"（离开视口 或 标签页切走都算不可见），
    // handleLoadedMetadata 里直接调用的 start() 也依赖这个标记做判断。
    const disposeVisibilityLifecycle = createVisibilityLifecycle(container, {
      onVisible: () => {
        isVisible = true;
        start();
      },
      onHidden: () => {
        isVisible = false;
        stop();
      },
    });

    return () => {
      stop();
      resizeObserver.disconnect();
      disposeVisibilityLifecycle();
      if (hoverEnabled) {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("blur", handlePointerLeaveWindow);
        document.removeEventListener("pointerleave", handlePointerLeaveWindow);
      }
      managedVideo.dispose();
      if (video.parentNode === container) {
        container.removeChild(video);
      }
      geometry.dispose();
      material.dispose();
      texture.dispose();
      rampTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // 所有可调参数只在挂载时读取一次，作为初始配置传入 uniforms；
    // 运行期不需要响应式地重建整个场景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, gridCols, gridRows]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`size-full ${className ?? ""}`}
      style={{ pointerEvents: "none" }}
    />
  );
}
