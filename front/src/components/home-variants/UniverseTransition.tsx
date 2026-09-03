"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";

import { CtaButton } from "@/components/CtaButton";
import {
  CommitColorPicker,
  CommitSlider,
  TuningPanelShell,
} from "@/components/dotSystemTuningControls";
import {
  createVisibilityLifecycle,
  getClampedDpr,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

import { HeroParticleTerrain } from "./HeroParticleTerrain";
import { LIQUID_ORB_VISIBLE_RADIUS_RATIO, LiquidOrb } from "./LiquidOrb";

// 方案 B 的 Hero + 「进入球体内部世界」滚动转场，合成一个组件。
//
// 节奏参考 bynar.io（只学交互节奏、不抄样式）：球在 Hero 里放大 → 玻璃溶解 →
// 星空铺满整屏 → 中央浮现一段主营业务介绍，停在星空里。
//
// AI社群 / FDE / 我们的团队 / 联系我们 四个板块**不再包在星空里翻页**，而是
// 排在本组件（宇宙转场）**下方**的正常页面流里（见 VariantEditorial）。宇宙
// 内部只负责「进入 + 展示那段话」。
//
// 一个 `h-[300vh]` 的 <section> 撑出滚动距离（钉住行程 ≈ 200vh），内部
// `sticky top-0 h-screen` 舞台全程钉在视口。行程给得足，是为了让每格滚轮只
// 推进一点点——穿球转场不会一滑到底。滚轮行程经 applyDom 里的 KNEE 映射后
// 驱动动画（不进 React state）：
//   幕 0 · 入场   时间线   底部波 → 球体由小放大 → Hero 文案浮现（导航是
//                          独立 fixed 层 HomeNav，自己播淡入，不在这条线上）
//   幕 1 · 进入   动画 p 0→0.3  Hero 文案淡出；球放大 + 玻璃溶解；浅色底淡出
//                              露深空；星空淡入铺满；两侧边注 → 中央业务介绍浮现
//   停留        动画 p 0.3→1  那段话钉住不动，一小段滚动后放行到宇宙下方内容
//
// prefers-reduced-motion：直接停在「深空 + 整段文案」终态，无动画。

// 悬浮胶囊导航已抽成独立的 fixed 顶层组件 HomeNav（在 VariantEditorial 里
// 渲染），不再是本组件的一层，也不再由入场时间线驱动淡入。

// 中央业务介绍：星空铺满后**逐字填实**——先整体淡入（暗灰），随滚动一个字
// 一个字从暗灰渐亮到纯白（参照 bynar / apple 那种 scroll-fill 文案）；填到
// 尾段时下方的白色弧形前沿正好升上来把它接走。
//   PARAGRAPH_IN   容器整体淡入 + 轻微上浮的动画 p 窗口
//   PARAGRAPH_FILL --fill（已点亮字数）从 0 推到总字数的动画 p 窗口
const PARAGRAPH_IN: [number, number] = [0.11, 0.15];
const PARAGRAPH_FILL: [number, number] = [0.12, 0.29];

// 段落按「token」拆：连续的 ASCII 字母/数字算一个 token（不会被拆断换行），
// 其余每个汉字/标点各算一个；空白不计入点亮序列、原样渲染保留字距。
// 两个 { link } 各算一个 token（AI 社群 / FDE 按钮，跟着一起点亮）。
type ParagraphSegment = string | { link: "ai" | "fde" };
const PARAGRAPH_SEGMENTS: ParagraphSegment[] = [
  "新岛专注人工智能领域的知识服务与工程落地，业务由 ",
  { link: "ai" },
  " 与 ",
  { link: "fde" },
  " 两大模块构成。前者面向个人与团队，持续沉淀前沿认知与实践方法；后者面向企业客户，交付深度定制的 AI 工程化落地。",
];
const PARAGRAPH_TOKEN_RE = /[A-Za-z0-9]+|\s+|[^\sA-Za-z0-9]/g;
function isWhitespaceToken(t: string) {
  return /^\s+$/.test(t);
}
const PARAGRAPH_UNIT_COUNT = PARAGRAPH_SEGMENTS.reduce((n, seg) => {
  if (typeof seg !== "string") return n + 1;
  return n + (seg.match(PARAGRAPH_TOKEN_RE) ?? []).filter((t) => !isWhitespaceToken(t)).length;
}, 0);

// reduced-motion 静态兜底用的整段纯文本。
const PARAGRAPH =
  "新岛专注人工智能领域的知识服务与工程落地，业务由 AI 社群与 FDE 两大模块构成。前者面向个人与团队，持续沉淀前沿认知与实践方法；后者面向企业客户，交付深度定制的 AI 工程化落地。";

// 把 PARAGRAPH_SEGMENTS 渲染成一串 <span class="uv-fill-char" style="--i:n">：
// 每个 token 带自己的序号 --i；容器上的 --fill（已点亮字数，含小数）经 CSS
// 的 calc 让每个 token 依次从暗灰亮到纯白。空白 token 原样输出、不占序号。
function ParagraphFillText() {
  let unit = 0;
  const nodes: ReactNode[] = [];
  PARAGRAPH_SEGMENTS.forEach((seg, si) => {
    if (typeof seg !== "string") {
      const i = unit++;
      const href = seg.link === "ai" ? "/ai" : "/fde";
      const label = seg.link === "ai" ? "AI 社群" : "FDE";
      nodes.push(
        <Link
          key={`lnk-${si}`}
          href={href}
          className="uv-fill-char pointer-events-auto mx-1.5 inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-0.5 align-middle text-[0.92em] font-medium text-white no-underline transition-colors hover:border-white/55 hover:bg-white/20"
          style={{ "--i": i } as CSSProperties}
        >
          {label} <span aria-hidden>↗</span>
        </Link>,
      );
      return;
    }
    (seg.match(PARAGRAPH_TOKEN_RE) ?? []).forEach((tok, ti) => {
      if (isWhitespaceToken(tok)) {
        nodes.push(<span key={`ws-${si}-${ti}`}>{" "}</span>);
        return;
      }
      const i = unit++;
      nodes.push(
        <span
          key={`t-${si}-${ti}`}
          className="uv-fill-char"
          style={{ "--i": i } as CSSProperties}
        >
          {tok}
        </span>,
      );
    });
  });
  return <>{nodes}</>;
}

// Hero / 页面浅底：中性浅灰（去掉原来的长春花紫色相），与下方 AI社群板块
// （#EEEEF0）同色，收尾白色前沿扫过后无缝交棒。底仍是一条线性渐变（顶部略深
// → 底部略亮），其上叠一个很大的半圆形柔光晕笼罩水晶球上半圈。PAGE_LIGHT 取
// 球缘要融进的中段色，也是调参面板「背景色」取色器的初始值/默认值。
const PAGE_LIGHT = "#EEEEF0";

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 100];
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

// 调参面板「背景色」取色器只给一个 hex，但设计稿底是 5 档明度的两层渐变
// （柔光晕 + 三段线性渐变）。这里把原设计稿几档色相对 PAGE_LIGHT 的**明度
// 差值**记下来，换背景色时保留同一套明暗层次，只把色相/饱和度换成新取色——
// 调色预览用，不追求跟原设计稿数值位位对应。
const [, , PAGE_LIGHT_L] = hexToHsl(PAGE_LIGHT);
const GRADIENT_L_DELTA = {
  halo: hexToHsl("#f9f8fe")[2] - PAGE_LIGHT_L,
  top: hexToHsl("#c6c7e9")[2] - PAGE_LIGHT_L,
  mid: hexToHsl("#d5d5ee")[2] - PAGE_LIGHT_L,
  bottom: hexToHsl("#eceaf6")[2] - PAGE_LIGHT_L,
};

function buildPageLightGradient(base: string): string {
  const [h, s, l] = hexToHsl(base);
  const at = (delta: number) => hslToHex(h, s, Math.min(100, Math.max(0, l + delta)));
  const halo = at(GRADIENT_L_DELTA.halo);
  const top = at(GRADIENT_L_DELTA.top);
  const mid = at(GRADIENT_L_DELTA.mid);
  const bottom = at(GRADIENT_L_DELTA.bottom);
  return [
    // 水晶球外的大柔光晕：一个很大的半圆形辉光，中心略高于球心，向四周大幅散开
    `radial-gradient(78% 72% at 50% 40%, ${halo} 0%, ${hexToRgba(halo, 0.66)} 30%, ${hexToRgba(halo, 0.2)} 58%, ${hexToRgba(halo, 0)} 84%)`,
    // 主底：线性渐变，颜色取自设计稿（换背景色时按上面明度差平移色相）
    `linear-gradient(177deg, ${top} 0%, ${mid} 44%, ${bottom} 100%)`,
  ].join(", ");
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function hexV3(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return new THREE.Vector3(1, 1, 1);
  return new THREE.Vector3(
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
  );
}

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.68 + 0.32 * sin(uTime * 0.8 + aSeed * 6.2831);
    vTw = tw;
    float s = aSize * uPixelRatio * (170.0 / max(-mv.z, 0.15));
    gl_PointSize = clamp(s, 0.5, 34.0 * uPixelRatio);
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColorDim;
  uniform vec3 uColorHot;
  varying float vTw;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float core = pow(1.0 - r * 2.0, 2.6);
    float glow = pow(1.0 - r * 2.0, 1.0) * 0.4;
    float a = (core + glow) * vTw;
    vec3 c = mix(uColorDim, uColorHot, clamp(vTw * 1.15, 0.0, 1.0));
    gl_FragColor = vec4(c * a, a);
  }
`;

function buildStarField(count: number) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // 均匀铺开的单层星场，不再叠加对角星带 —— 减少「杂乱成团」的观感。
    const x = (Math.random() - 0.5) * 52;
    const y = (Math.random() - 0.5) * 34;
    const z = -80 + Math.random() * 96;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const r = Math.random();
    // 绝大多数是细小暗星，只有极少数（3%）稍亮一点，且亮星也收敛尺寸。
    size[i] = r < 0.97 ? 0.4 + Math.random() * 1.1 : 2.0 + Math.random() * 1.8;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  return geo;
}

// ── 水晶球「外壳」调参 ────────────────────────────────────────────
// 点阵外壳 + 冰晶外壳的可调样式。和 LiquidOrb 一样：仅开发环境显示一个面板，
// 滑块实时改 → 存 localStorage，「打印当前数值」把整个对象 console.log 出来，
// 定稿后抄回下面这个 SHELL_DEFAULTS 即可。生产环境永远停在默认值。
const SHELL_STORAGE_KEY = "novaisland:hero-shell:v1";

const SHELL_DEFAULTS = {
  // —— 点阵外壳 ——
  dotScalePct: 70, // 直径 = orbWrap 尺寸的百分比
  dotGapPx: 12, // 网点间距
  dotSizePx: 0.9, // 网点半径
  dotOpacity: 0.95, // 网点不透明度
  dotColor: "#ffffff",
  dotMaskInnerPct: 34, // 圆形羽化遮罩：此半径内实心
  dotMaskOuterPct: 82, // 圆形羽化遮罩：到此半径归零
  // —— 冰晶外壳 ——
  iceScalePct: 134, // blob 直径 = orbWrap 尺寸的百分比
  iceBlurPx: 7, // backdrop 磨砂模糊
  iceBrightnessPct: 106, // backdrop 提亮（100 = 原样）
  iceFrostOpacity: 0.6, // 最外圈磨砂白度
  iceRimOpacity: 0.72, // 边缘反光亮度
  iceRimWidthPx: 1.4, // 边缘反光宽度
  iceSpecOpacity: 0.55, // 高光 / 环境光窗亮度
  iceSwayDeg: 2, // 摆动幅度（度）
};
type ShellTuning = typeof SHELL_DEFAULTS;

const SHELL_DEV = process.env.NODE_ENV !== "production";

function loadShellTuning(): ShellTuning {
  if (!SHELL_DEV || typeof window === "undefined") return SHELL_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
    if (!raw) return SHELL_DEFAULTS;
    return { ...SHELL_DEFAULTS, ...(JSON.parse(raw) as Partial<ShellTuning>) };
  } catch {
    return SHELL_DEFAULTS;
  }
}

// 同一条 blob 路径的两种坐标系写法：objectBoundingBox（0..1，给 CSS clip-path）
// 与 viewBox 用户坐标（0..100，给可见 SVG 描边 / 裁剪）。
const ICE_BLOB_PATH_UNIT =
  "M0.959,0.375 Q0.985,0.5 0.959,0.625 Q0.933,0.75 0.834,0.829 Q0.735,0.907 0.618,0.954 Q0.5,1 0.385,0.949 Q0.27,0.898 0.169,0.824 Q0.067,0.75 0.041,0.625 Q0.015,0.5 0.041,0.375 Q0.067,0.25 0.166,0.172 Q0.265,0.093 0.383,0.049 Q0.5,0.005 0.615,0.054 Q0.73,0.102 0.832,0.176 Q0.933,0.25 0.959,0.375 Z";
const ICE_BLOB_PATH_PX =
  "M95.9,37.5 Q98.5,50 95.9,62.5 Q93.3,75 83.4,82.9 Q73.5,90.7 61.8,95.4 Q50,100 38.5,94.9 Q27,89.8 16.9,82.4 Q6.7,75 4.1,62.5 Q1.5,50 4.1,37.5 Q6.7,25 16.6,17.2 Q26.5,9.3 38.3,4.9 Q50,0.5 61.5,5.4 Q73,10.2 83.2,17.6 Q93.3,25 95.9,37.5 Z";

export function UniverseTransition() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const lightRef = useRef<HTMLDivElement | null>(null);
  const terrainRef = useRef<HTMLDivElement | null>(null);
  const orbWrapRef = useRef<HTMLDivElement | null>(null);
  const dotShellRef = useRef<HTMLDivElement | null>(null);
  const iceShellRef = useRef<HTMLDivElement | null>(null);
  const starWrapRef = useRef<HTMLDivElement | null>(null);
  const nebulaRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const eyebrowRef = useRef<HTMLDivElement | null>(null);
  const leftAsideRef = useRef<HTMLDivElement | null>(null);
  const rightAsideRef = useRef<HTMLDivElement | null>(null);
  const staticRef = useRef<HTMLDivElement | null>(null);

  const progressRef = useRef(0);
  // 挂载 effect 里的 applyDom 暴露出来：调外壳参数后需要立刻按当前滚动进度
  // 重刷一次 DOM（尤其是外壳 opacity），否则要等下一次 scroll 事件才更新。
  const applyDomRef = useRef<((p: number) => void) | null>(null);
  const dissolveRef = useRef(0); // 传给 LiquidOrb，按帧读取
  const introRef = useRef(0); // 入场动画进度 0→1（1 = 完成）。按帧读取，不进 state
  const orbRevealRef = useRef(0); // 传给 LiquidOrb：水晶球内部「注入充满」+ 反光渐显

  // Hero 背景色：默认取设计稿的 PAGE_LIGHT，只在开发环境调参面板（LiquidOrb
  // 的「背景色」取色器）拖动时才会变——生产环境面板不渲染，这个 state 永远
  // 停在默认值。改这个 state 会同步驱动两处：下面的 lightRef 底色渐变、
  // 以及传给 LiquidOrb 的 pageColor（球缘融入色）。
  const [heroBgColor, setHeroBgColor] = useState(PAGE_LIGHT);
  const pageLightGradient = useMemo(
    () => buildPageLightGradient(heroBgColor),
    [heroBgColor],
  );

  // ── 挂载门控 ─────────────────────────────────────────────────
  // 球 + 底部地形各带一个 WebGL 上下文；滚过进入阶段后就卸载，把上下文
  // 让给下方板块。只在进度跨过边界时才 setState（低频）。
  const [entryMounted, setEntryMounted] = useState(true);
  const mountStateRef = useRef({ entry: true });

  // ── 外壳（点阵 + 冰晶）调参 ──────────────────────────────────
  const [shell, setShell] = useState<ShellTuning>(SHELL_DEFAULTS);
  const [panelMounted, setPanelMounted] = useState(false);
  const shellPersistSkip = useRef(true);
  useEffect(() => {
    // 挂载后再读 localStorage / 置 mounted：避免 SSR 首帧 hydration 不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanelMounted(true);
  }, []);
  useEffect(() => {
    if (!SHELL_DEV) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShell(loadShellTuning());
  }, []);
  useEffect(() => {
    if (!SHELL_DEV || typeof window === "undefined") return;
    if (shellPersistSkip.current) {
      shellPersistSkip.current = false;
      return;
    }
    try {
      window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(shell));
    } catch {
      /* 隐私模式 / 配额：忽略 */
    }
    // 参数变了立刻按当前滚动进度重刷外壳 opacity，不用等下一次 scroll。
    applyDomRef.current?.(progressRef.current);
  }, [shell]);

  const dotShellStyle = useMemo<CSSProperties>(() => {
    const inner = shell.dotMaskInnerPct;
    const outer = shell.dotMaskOuterPct;
    const mid = (inner + outer) / 2;
    const mask = `radial-gradient(circle at 50% 46%, #000 ${inner}%, rgba(0,0,0,0.5) ${mid}%, rgba(0,0,0,0) ${outer}%)`;
    return {
      width: `${shell.dotScalePct}%`,
      height: `${shell.dotScalePct}%`,
      opacity: 0,
      willChange: "opacity",
      backgroundImage: `radial-gradient(${hexToRgba(shell.dotColor, shell.dotOpacity)} ${shell.dotSizePx}px, transparent ${(shell.dotSizePx + 0.6).toFixed(2)}px), radial-gradient(rgba(83,66,120,0.22) ${(shell.dotSizePx + 0.6).toFixed(2)}px, transparent ${(shell.dotSizePx + 1.1).toFixed(2)}px)`,
      backgroundSize: `${shell.dotGapPx}px ${shell.dotGapPx}px, ${shell.dotGapPx}px ${shell.dotGapPx}px`,
      backgroundPosition: "center, calc(50% + 0.5px) calc(50% + 0.5px)",
      WebkitMaskImage: mask,
      maskImage: mask,
    };
  }, [shell]);

  const iceFrostStyle = useMemo<CSSProperties>(() => {
    const f = shell.iceFrostOpacity;
    const filter = `blur(${shell.iceBlurPx}px) brightness(${(shell.iceBrightnessPct / 100).toFixed(3)}) saturate(1.04)`;
    return {
      clipPath: "url(#hero-ice-blob)",
      WebkitClipPath: "url(#hero-ice-blob)",
      backdropFilter: filter,
      WebkitBackdropFilter: filter,
      background: `radial-gradient(circle at 50% 44%, rgba(255,255,255,0) 42%, rgba(255,255,255,${(f * 0.05).toFixed(3)}) 60%, rgba(255,255,255,${(f * 0.27).toFixed(3)}) 76%, rgba(244,248,255,${(f * 0.73).toFixed(3)}) 90%, rgba(255,255,255,${f.toFixed(3)}) 100%)`,
    };
  }, [shell]);

  useEffect(() => {
    const section = sectionRef.current;
    const starWrap = starWrapRef.current;
    if (!section || !starWrap) return;

    const reduce = prefersReducedMotion();
    document.documentElement.style.setProperty("--universe-ai-ready", "0");

    // ── 星场场景 ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 260);
    camera.position.set(0, 0, 14);

    // 星场几何 / 材质：与 renderer 生命周期解耦——renderer 可能被反复
    // 拆建（滚出视口释放上下文、上下文丢失后重建），这两个对象整段 effect
    // 期间只建一次，three 会在换 renderer 后自动把 buffer/program 重新上传。
    const starCount = window.innerWidth < 720 ? 520 : 900;
    const geo = buildStarField(starCount);
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      // 暗星偏冷灰蓝、几乎不带紫；亮星近白微冷。整体像实拍夜空而非霓虹星云。
      uColorDim: { value: hexV3("#7c8399") },
      uColorHot: { value: hexV3("#f1f3fa") },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // ── renderer 的建/拆 ──────────────────────────────────────
    // 「星星宇宙容易崩溃」的根因：星场 WebGL 上下文是全页面最老的一个，滚到
    // 下方那几个「视频转点阵」板块时，它们各建一个新上下文，浏览器为了腾资源
    // 会**静默回收最老的**（= 星场）→ 星空黑掉。对策：
    //   1. 滚出视口一段时间后**主动释放**星场上下文，滚回来再重建；
    //   2. 真被回收（webglcontextlost）时不干等浏览器补发 restored 事件
    //      （Chrome 常常不发），自己拆掉重建。
    let renderer: THREE.WebGLRenderer | null = null;
    let contextFailed = false; // 建不出上下文 → 永久降级
    let rebuildTimer = 0;
    let teardownTimer = 0;
    let shouldRun = false; // 视口内、该跑渲染循环
    let vw = 0;
    let vh = 0;

    function degradeToStatic() {
      contextFailed = true;
      if (lightRef.current) lightRef.current.style.opacity = "0";
      if (heroRef.current) heroRef.current.style.opacity = "0";
      if (terrainRef.current) terrainRef.current.style.opacity = "0";
      if (orbWrapRef.current) orbWrapRef.current.style.opacity = "0";
      introRef.current = 1;
      orbRevealRef.current = 1;
      if (nebulaRef.current) {
        nebulaRef.current.style.opacity = "0.9";
        nebulaRef.current.style.removeProperty("clip-path");
        nebulaRef.current.style.removeProperty("-webkit-clip-path");
      }
      if (staticRef.current) staticRef.current.style.opacity = "1";
      document.documentElement.style.setProperty("--universe-ai-ready", "1");
    }

    function onCtxLost(e: Event) {
      e.preventDefault();
      stop();
      // 主动重建：拆掉被回收的 renderer，短延迟后新建一个（等浏览器把
      // 资源真正释放）。不依赖 webglcontextrestored。
      if (rebuildTimer) return;
      rebuildTimer = window.setTimeout(() => {
        rebuildTimer = 0;
        unmountRenderer();
        if (shouldRun) {
          if (mountRenderer()) {
            readProgress();
            start();
          } else {
            degradeToStatic();
          }
        }
      }, 450);
    }
    function onCtxRestored() {
      vw = 0;
      vh = 0;
      resize();
      if (shouldRun) start();
    }

    function mountRenderer(): boolean {
      if (renderer || contextFailed) return !!renderer;
      let r: THREE.WebGLRenderer;
      try {
        r = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
          failIfMajorPerformanceCaveat: false,
        });
      } catch {
        return false;
      }
      // 穿入后的宇宙沿用 FDE 的靛紫底色，星场 canvas 不再铺近黑色。
      r.setClearColor(0x332161, 1);
      r.domElement.style.cssText = "display:block;width:100%;height:100%";
      r.domElement.addEventListener("webglcontextlost", onCtxLost, false);
      r.domElement.addEventListener("webglcontextrestored", onCtxRestored, false);
      starWrap!.appendChild(r.domElement);
      renderer = r;
      vw = 0;
      vh = 0;
      resize();
      return true;
    }

    function unmountRenderer() {
      if (!renderer) return;
      stop();
      const c = renderer.domElement;
      c.removeEventListener("webglcontextlost", onCtxLost);
      c.removeEventListener("webglcontextrestored", onCtxRestored);
      renderer.dispose();
      if (c.parentNode === starWrap) starWrap!.removeChild(c);
      renderer = null;
    }

    function resize() {
      if (!renderer) return;
      const w = starWrap!.clientWidth;
      const h = starWrap!.clientHeight;
      if (w === vw && h === vh) return;
      vw = w;
      vh = h;
      const dpr = Math.min(1.5, getClampedDpr());
      uniforms.uPixelRatio.value = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }

    // ── 入场动画时间线（进入本页时播一次）─────────────────────
    // 顺序：底部波先浮现 → 中间 3D 球体在视口正中由小到大出现 →
    // 球体放大落位后 Hero 文案才浮现。整段约 2.6s，命令式推进 introRef，
    // 每帧复用同一个 applyDom 写 DOM。prefers-reduced-motion 直接跳终态。
    const INTRO_MS = 2800;
    let introRaf = 0;
    let introStart = 0;
    function introFrame(now: number) {
      if (!introStart) introStart = now;
      introRef.current = clamp01((now - introStart) / INTRO_MS);
      applyDom(progressRef.current);
      if (introRef.current < 1) introRaf = requestAnimationFrame(introFrame);
    }

    // ── 滚动进度 → DOM ───────────────────────────────────────
    let ticking = false;
    // 只在进度跨过挂载边界时才 setState（低频，不影响每帧命令式写 DOM）
    function syncMountState(p: number) {
      // 球 + 底部地形只在进入阶段需要；滚过 0.85（原始滚轮进度）就卸载，把
      // WebGL 上下文让给下方板块。留一点回滚余量避免边界抖动反复挂卸。
      const entry = p < 0.85;
      const s = mountStateRef.current;
      if (entry !== s.entry) {
        mountStateRef.current = { entry };
        setEntryMounted(entry);
      }
    }

    function readProgress() {
      ticking = false;
      const rect = section!.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      progressRef.current = total > 0 ? clamp01(-rect.top / total) : 0;
      applyDom(progressRef.current);
      syncMountState(progressRef.current);
    }
    function onScroll() {
      // 用户在入场动画期间就滚动 → 直接快进到终态，别和滚动进度打架
      if (introRef.current < 1) {
        introRef.current = 1;
        if (introRaf) cancelAnimationFrame(introRaf);
      }
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(readProgress);
      }
    }

    function applyDom(pRaw: number) {
      // 把滚轮行程重新映射到动画进度：进入阶段（穿过水晶球 → 星空铺满 →
      // 那段话浮现）吃掉**绝大部分**行程——这样每一格滚轮只推进一点点，穿球
      // 转场不会一滑到底；那段话到位后只留很短一段「停留 + 白幕」就放行到
      // 宇宙下方的内容。KNEE_REAL 越大 = 进入阶段越慢、越可控。
      //   滚轮 0 → KNEE_REAL   映射到  动画 0 → KNEE_ANIM （进入 + 浮现）
      //   滚轮 KNEE_REAL → 1   映射到  动画 KNEE_ANIM → 1 （短暂停留后放行）
      const KNEE_REAL = 0.85;
      const KNEE_ANIM = 0.3;
      const p =
        pRaw < KNEE_REAL
          ? (pRaw / KNEE_REAL) * KNEE_ANIM
          : KNEE_ANIM + ((pRaw - KNEE_REAL) / (1 - KNEE_REAL)) * (1 - KNEE_ANIM);

      // ── 幕 0 · 入场动画（只在 intro<1 时生效，之后各因子恒为 1）──────
      const intro = introRef.current;
      const waveIn = smoothstep(0.05, 0.28, intro); // 底部波先浮现（导航现在自己播）
      // 球由小到大：小的时候是一颗**全透明**的水晶球（只有玻璃反光/色散），
      // 球放大 **与** 球内星云星尘从透明显影 **同步进行**（同一时间窗），
      // 一起在同一拍完成 → 定格后稍作停留，Hero 文案才浮现。
      const orbGrowWindow: [number, number] = [0.06, 0.42];
      const orbIntroScale = lerp(0.34, 1, smoothstep(...orbGrowWindow, intro)); // 由小到大
      const orbIntroOpacity = smoothstep(0.04, 0.16, intro); // 透明玻璃球先淡入
      const orbSettle = smoothstep(...orbGrowWindow, intro); // 0 = 视口正中，1 = 版式落位
      const orbReveal = smoothstep(...orbGrowWindow, intro); // 星云星尘与放大同步显影
      const heroIn = smoothstep(0.52, 0.8, intro); // 球成形定格、稍停后 Hero 文案才浮现

      orbRevealRef.current = intro >= 1 ? 1 : orbReveal;

      // ── 幕 1 · 进入 ──────────────────────────────────────
      // Hero 文案：滚轮一动就快速淡出
      if (heroRef.current) {
        const o = (1 - smoothstep(0.004, 0.055, p)) * heroIn;
        heroRef.current.style.opacity = o.toFixed(3);
        const s = 1 + smoothstep(0, 0.3, p) * 0.06;
        const ty = lerp(14, 0, heroIn); // 入场时轻轻上浮
        heroRef.current.style.transform = `translateY(${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
      }
      if (terrainRef.current) {
        terrainRef.current.style.opacity = (
          (1 - smoothstep(0.006, 0.085, p)) * waveIn
        ).toFixed(3);
      }
      // 球：从球心向外**流动溶解**，同时放大。溶解掉的像素直接透明 →
      // 露出 orbWrap 后面那张**真正的 3D 星空 canvas**（starWrapRef，全屏满分辨率、
      // 不缩放），canvas 用一个圆形 clip 跟着溶解孔长大 → 只有溶解处能看到真星空，
      // 圆外背景仍是浅色底。
      // **规则**：球铺满整屏之前，溶解孔始终小于球体（留一圈玻璃壳）；
      //           铺满之后，溶解才补完、clip 才铺满整屏。
      const orbWrap = orbWrapRef.current;
      const orbW = orbWrap ? orbWrap.clientWidth : 640;
      const orbCanvas = orbWrap?.querySelector("canvas");
      // canvas 的 clientHeight 不包含外层滚动 scale，可作为稳定的基准。
      // 首帧 WebGL canvas 尚未插入时，按 inset-[-18%] 的 1.36× 尺寸兜底。
      const orbCanvasSize = orbCanvas?.clientHeight || orbW * 1.36;
      const baseCircleR = orbCanvasSize * LIQUID_ORB_VISIBLE_RADIUS_RATIO;
      // Hero 桌面构图中球心偏右、偏上；转场裁剪直接读真实 DOM
      // 中心，不再把球心假定在视口正中。transform 缩放不会改变该中心。
      const orbRect = orbWrap?.getBoundingClientRect();
      const cx = orbRect ? (orbRect.left + orbRect.right) / 2 : window.innerWidth / 2;
      const cy = orbRect ? (orbRect.top + orbRect.bottom) / 2 : window.innerHeight / 2;
      const viewportCoverR = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(window.innerWidth - cx, cy),
        Math.hypot(cx, window.innerHeight - cy),
        Math.hypot(window.innerWidth - cx, window.innerHeight - cy),
      );
      // 宽屏上 3× 不一定足以覆盖四角。保留原有至少 3× 的节奏，
      // 同时把终态放大到真实球缘越过最远屏幕角。
      const targetScale = Math.max(3, (viewportCoverR * 1.12) / Math.max(baseCircleR, 1));
      const scale = lerp(1, targetScale, smoothstep(0, 0.24, p));
      const diss = clamp01(
        smoothstep(0.02, 0.055, p) * 0.08 + // 起步一小跳
          smoothstep(0.03, 0.19, p) * 0.42 + // 增长期封顶 ~0.5（eat≈0.68，玻璃壳留 0.68→1）
          smoothstep(0.19, 0.26, p) * 0.5, // 铺满后补到 1.0（提前到 ~p0.26，紧接卡片）
      );
      dissolveRef.current = diss;
      if (orbWrap) {
        // 入场时球心从视口正中缓缓落到版式位置（桌面版式位置本就近似居中，
        // 移动端会有一段可见的下移落位）。元素带 translateY(-50%)，其视觉中心
        // 即 offsetTop；offsetTop 基准不受 transform 影响。
        const layoutCenterY = orbWrap.offsetTop;
        const introOffsetY =
          (window.innerHeight / 2 - layoutCenterY) * (1 - orbSettle);
        const orbScale = scale * orbIntroScale;
        orbWrap.style.transform = `translate(-50%, calc(-50% + ${introOffsetY.toFixed(1)}px)) scale(${orbScale.toFixed(3)})`;
        orbWrap.style.opacity = (
          (1 - smoothstep(0.26, 0.34, p)) * orbIntroOpacity
        ).toFixed(3);
        orbWrap.style.pointerEvents = intro > 0.99 && p <= 0.05 ? "auto" : "none";
      }
      // 点阵外壳 + 冰晶外壳：跟 Hero 文案同拍淡入（heroIn），滚动一动（p）
      // 就随球体溶解一起快速淡出——之后球体被 CSS 放大穿屏，这两层留着只会
      // 变成巨大的网点 / 磨砂块。
      {
        const shellO = (1 - smoothstep(0.004, 0.05, p)) * heroIn;
        if (dotShellRef.current) dotShellRef.current.style.opacity = shellO.toFixed(3);
        if (iceShellRef.current) iceShellRef.current.style.opacity = shellO.toFixed(3);
      }
      // 真 3D 星场 canvas 的圆形 clip：中心对齐球心，半径跟着溶解孔（比孔大一圈，
      // 差值藏进不透明玻璃壳里）。球放大 → circleR 变大 → clip 最终铺满整屏。
      const circleR = baseCircleR * scale; // shader 真实可见球半径 (px)
      // clip 半径：跟着溶解孔走，但**绝不越过可见玻璃球的边缘 0.86·circleR**——
      // 否则星空会盖过球、探到球外的浅底上（老板多次指出的问题）。
      const holeR = Math.min(
        circleR * Math.min(1.1, diss * 1.35 + 0.16),
        circleR * 0.86,
      );
      // 只有当玻璃球**确实**盖住整个视口（真实球缘已越过最远屏幕角）且溶解
      // 正在补完最后一圈时，才让 clip 越过球缘、平滑放到铺满整屏。
      const cover =
        smoothstep(viewportCoverR, viewportCoverR * 1.1, circleR) *
        smoothstep(0.5, 0.85, diss);
      const clipR =
        cover > 0.001
          ? Math.max(holeR, lerp(holeR, viewportCoverR * 1.04, cover))
          : holeR;
      const clip = `circle(${clipR.toFixed(0)}px at ${cx.toFixed(0)}px ${cy.toFixed(0)}px)`;
      // 星场 / 星云一旦铺满就**保持到底**——卡片都是磨砂玻璃，要一直有星空从
      // 后面透出来，滚到底直接接 Footer（不再淡回浅色接章节）。
      starWrap!.style.opacity = smoothstep(0.008, 0.04, p).toFixed(3);
      starWrap!.style.setProperty("clip-path", clip);
      starWrap!.style.setProperty("-webkit-clip-path", clip);
      if (nebulaRef.current) {
        // 进入过渡缝时星云辉光淡出：它模糊的边缘会在下方那道弧形渐变上叠出
        // 对不齐的软环，把缝弄脏。星点 canvas 留着当深空，painterly 光斑退掉。
        const seamFade = 1 - smoothstep(0.62, 0.9, pRaw);
        nebulaRef.current.style.opacity = (
          smoothstep(0.008, 0.045, p) * seamFade
        ).toFixed(3);
        nebulaRef.current.style.setProperty("clip-path", clip);
        nebulaRef.current.style.setProperty("-webkit-clip-path", clip);
      }
      // 浅色底：clip 铺满后被真星场盖住，安全淡出后**不再淡回**。
      if (lightRef.current) {
        lightRef.current.style.opacity = (1 - smoothstep(0.26, 0.36, p)).toFixed(3);
      }
      // 只有玻璃球已退场、Hero 浅底已消失、宇宙铺满整屏后，才解锁
      // 下一个 sibling（AI 社群）的圆弧。这里直接使用原始滚动进度铺开
      // 约 22vh 的显现距离，避免 KNEE 后的动画进度加速导致一帧闪出。
      const universeReady = smoothstep(0.87, 0.98, pRaw);
      document.documentElement.style.setProperty(
        "--universe-ai-ready",
        universeReady.toFixed(3),
      );
      // 穿壳微光：球膨胀铺满那一下，一次柔和呼吸光
      if (flashRef.current) {
        const f = smoothstep(0.13, 0.19, p) * (1 - smoothstep(0.19, 0.27, p));
        flashRef.current.style.opacity = (f * 0.22).toFixed(3);
      }
      // ── 幕 1 · 两侧边注 ────────────────────────────────────
      // 严格顺序：Hero 文案(~p0.055)完全淡尽后两侧文字才浮现；两侧文字完全淡尽
      // 后中心那句「你好」才浮现 —— 前一段没消失，后一段不出现。
      if (leftAsideRef.current && rightAsideRef.current) {
        const asideV =
          smoothstep(0.055, 0.08, p) * (1 - smoothstep(0.085, 0.105, p));
        const asideDrift = lerp(10, 0, smoothstep(0.055, 0.085, p));
        leftAsideRef.current.style.opacity = asideV.toFixed(3);
        leftAsideRef.current.style.transform = `translate(0, calc(-50% + ${asideDrift.toFixed(1)}px))`;
        rightAsideRef.current.style.opacity = asideV.toFixed(3);
        rightAsideRef.current.style.transform = `translate(0, calc(-50% + ${asideDrift.toFixed(1)}px))`;
      }

      // 中心主营业务介绍：两侧边注淡尽后整体淡入（暗灰），随后随滚动**逐字
      // 填实**到纯白。--fill 推到「总字数 + 一点羽化余量」，让最后一个字也能
      // 亮满。里面的 AI 社群 / FDE 按钮在快填完时才可点。
      // reduced-motion 下这段交给居中的 staticRef，不驱动 eyebrow。
      if (eyebrowRef.current && !reduce) {
        const appear = smoothstep(PARAGRAPH_IN[0], PARAGRAPH_IN[1], p);
        eyebrowRef.current.style.opacity = appear.toFixed(3);
        eyebrowRef.current.style.transform = `translate(-50%, ${lerp(14, 0, appear).toFixed(1)}px)`;
        const fillT = smoothstep(PARAGRAPH_FILL[0], PARAGRAPH_FILL[1], p);
        eyebrowRef.current.style.setProperty(
          "--fill",
          (fillT * (PARAGRAPH_UNIT_COUNT + 5)).toFixed(2),
        );
        const pe = fillT > 0.85 ? "auto" : "none";
        eyebrowRef.current.querySelectorAll("a").forEach((a) => {
          (a as HTMLElement).style.pointerEvents = pe;
        });
      }

      // ── 幕 2 · 收束进入下方内容 ──────────────────────────────
      // 过渡缝**只有一层弧**，做在 AI社群板块自己的顶上（AiCommunityCarousel
      // 里那个 bottom-full 的 .seam-arc），它跟着板块一起随滚动上升 → 跟标题
      // 恒定间距、不会甩开。这里不再画任何 wash / 白幕——单层不透明弧 + 噪点，
      // 靠 --universe-ai-ready 淡入。之前叠在这里的半透明白幕会和那道弧、和
      // 星云光斑一起在缝里叠出好几道对不齐的渐变环，已删除。
      // 收束时星场略微「后退」一点点带出纵深感。位移/缩放都压得很小。
      // 缩放锚在中心偏下，让让出的缝集中在顶部、不在视觉主区。
      const exit = smoothstep(0.66, 0.94, pRaw);
      const recede = `translateY(${(-0.6 * exit).toFixed(2)}vh) scale(${(1 - 0.008 * exit).toFixed(4)})`;
      starWrap!.style.transformOrigin = "50% 60%";
      starWrap!.style.transform = recede;
      if (nebulaRef.current) {
        nebulaRef.current.style.transformOrigin = "50% 60%";
        nebulaRef.current.style.transform = recede;
      }
    }
    applyDomRef.current = applyDom;

    // ── 渲染循环 ─────────────────────────────────────────────
    let raf = 0;
    let running = false;
    const clock = new THREE.Clock();

    function frame() {
      if (!renderer) {
        running = false;
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.05);
      uniforms.uTime.value += dt;
      const t = uniforms.uTime.value;

      // 进入水晶球后**不再做视角前进 / 转向**——星空只是极缓慢地呼吸漂移，
      // 让卡片有一个安静的深空背景。
      camera.position.z = 14;
      camera.position.x = Math.sin(t * 0.035) * 0.8;
      camera.position.y = Math.cos(t * 0.028) * 0.55;
      camera.rotation.z = Math.sin(t * 0.016) * 0.025;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || !renderer) return;
      running = true;
      clock.start();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function renderOnce() {
      if (renderer) renderer.render(scene, camera);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(starWrap);
    window.addEventListener("scroll", onScroll, { passive: true });

    // 首帧建一次 renderer。建不出来 → 直接降级终态。
    if (!mountRenderer()) {
      degradeToStatic();
      return () => {
        window.removeEventListener("scroll", onScroll);
        ro.disconnect();
        geo.dispose();
        mat.dispose();
        document.documentElement.style.removeProperty("--universe-ai-ready");
      };
    }
    readProgress();

    let dispose = () => {};
    if (reduce) {
      // 无动画：跳过入场时间线，直接停在深空终态
      introRef.current = 1;
      orbRevealRef.current = 1;
      if (heroRef.current) heroRef.current.style.opacity = "0";
      if (lightRef.current) lightRef.current.style.opacity = "0";
      if (terrainRef.current) terrainRef.current.style.opacity = "0";
      if (orbWrapRef.current) orbWrapRef.current.style.opacity = "0";
      dissolveRef.current = 1;
      document.documentElement.style.setProperty("--universe-ai-ready", "1");
      starWrap.style.opacity = "1";
      starWrap.style.removeProperty("clip-path");
      starWrap.style.removeProperty("-webkit-clip-path");
      if (nebulaRef.current) {
        nebulaRef.current.style.opacity = "0.9";
        nebulaRef.current.style.removeProperty("clip-path");
      }
      if (staticRef.current) staticRef.current.style.opacity = "1";
      uniforms.uTime.value = 6;
      renderOnce();
    } else {
      dispose = createVisibilityLifecycle(section, {
        onVisible: () => {
          shouldRun = true;
          if (teardownTimer) {
            clearTimeout(teardownTimer);
            teardownTimer = 0;
          }
          if (!renderer && !contextFailed) {
            if (mountRenderer()) {
              readProgress(); // clip-path / opacity 归位
            } else {
              degradeToStatic();
              return;
            }
          }
          start();
        },
        onHidden: () => {
          shouldRun = false;
          stop();
          // 滚出视口一段时间后彻底释放星场上下文，把 WebGL 名额让给下方
          // 板块的点阵——这是「星星宇宙崩溃」的正解。来回横跨边界不立刻拆。
          if (!teardownTimer && renderer) {
            teardownTimer = window.setTimeout(() => {
              teardownTimer = 0;
              if (!shouldRun) unmountRenderer();
            }, 1400);
          }
        },
      });
      // 入场动画：readProgress() 已用 intro=0 把导航/波/球/文案压到隐藏，
      // 现在开始推进时间线逐帧揭示。
      introRaf = requestAnimationFrame(introFrame);
    }

    return () => {
      stop();
      if (introRaf) cancelAnimationFrame(introRaf);
      if (rebuildTimer) clearTimeout(rebuildTimer);
      if (teardownTimer) clearTimeout(teardownTimer);
      dispose();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      unmountRenderer();
      geo.dispose();
      mat.dispose();
      applyDomRef.current = null;
      document.documentElement.style.removeProperty("--universe-ai-ready");
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="overview"
      className="relative h-[300vh] bg-[#332161]"
      aria-label="新岛 · 进入"
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* ── 最底：沿用 FDE 的靛紫 / 中紫 / 长春花紫色场。 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 12% 78%, rgba(51,33,97,0.98), transparent 48%), radial-gradient(ellipse at 82% 76%, rgba(140,87,199,0.72), transparent 52%), radial-gradient(ellipse at 54% 24%, rgba(204,179,235,0.34), transparent 45%), linear-gradient(132deg, #332161 0%, #554178 42%, #745495 72%, #8c73a9 100%)",
          }}
        />

        {/* ── 浅色底（Hero/页面底色）：**开场满、全程不变**，直到球放大盖住
             整屏才淡出。在真星场下面。 ── */}
        <div
          ref={lightRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: pageLightGradient, willChange: "opacity" }}
        />

        {/* Hero 底部的低对比度 3D 点阵地形：只在开场存在，进入球体时淡出。 */}
        <div
          ref={terrainRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(210px,28svh,360px)]"
          style={{ opacity: 0, willChange: "opacity" }}
        >
          {/* 调参面板默认收起：当前配色/参数已定稿，同 LiquidOrb 那个面板一样，
              要临时调参时把 debug 改回 true（或删掉这个 prop 用组件默认值）
              即可重新打开。 */}
          {entryMounted && <HeroParticleTerrain className="size-full" debug={false} />}
        </div>

        {/* ── 真 3D 星场（全屏满分辨率、不缩放）：用圆形 clip-path 跟着
             溶解孔长大，只在溶解处可见；圆外仍是浅底。 ── */}
        <div
          ref={starWrapRef}
          aria-hidden
          className="absolute inset-0 opacity-0"
          style={{ willChange: "opacity, clip-path, transform" }}
        />

        {/* ── 星云辉光（叠在星场上）。跟 clip 同心的一大团中央辉光。 ── */}
        <div
          ref={nebulaRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{ willChange: "opacity, transform" }}
        >
          <div
            className="absolute left-1/2 top-[31%] h-[240vmax] w-[240vmax] -translate-x-1/2 -translate-y-1/2 lg:left-1/2 lg:top-[49.5%]"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(204,179,235,0.42), rgba(140,87,199,0.34) 28%, rgba(85,65,120,0.26) 50%, rgba(51,33,97,0.18) 70%, transparent 96%)",
              filter: "blur(70px)",
            }}
          />
          <div
            className="absolute left-[14%] top-[14%] h-[80vh] w-[64vw]"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(143,216,229,0.24), rgba(204,179,235,0.12) 44%, transparent 72%)",
              filter: "blur(54px)",
            }}
          />
          <div
            className="absolute right-[6%] bottom-[8%] h-[72vh] w-[56vw]"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(240,184,219,0.2), rgba(140,87,199,0.1) 46%, transparent 70%)",
              filter: "blur(58px)",
            }}
          />
        </div>

        {/* ── 水晶球：Hero 原位，滚动放大穿过 ── */}
        <div
          ref={orbWrapRef}
          className="absolute left-1/2 top-[31%] h-[min(80vw,360px)] w-[min(80vw,360px)] lg:left-1/2 lg:top-[49.5%] lg:h-[clamp(430px,62svh,1080px)] lg:w-[clamp(430px,62svh,1080px)]"
          style={{
            transform: "translate(-50%, -50%) scale(0.34)",
            opacity: 0,
            willChange: "transform, opacity",
          }}
        >
          <div className="absolute inset-[-18%]">
            {entryMounted && (
              <LiquidOrb
                className="h-full w-full"
                pageColor={heroBgColor}
                // 开发环境显示水晶球本体调参面板（右侧）；外壳调参面板在左侧。
                debug={SHELL_DEV}
                dissolveRef={dissolveRef}
                revealRef={orbRevealRef}
                onBackgroundColorCommit={setHeroBgColor}
              />
            )}
          </div>

          {/* ── 点阵外壳：套在水晶球外的一层网点球面轮廓（见参考图）。
               规则网点 + 圆形羽化遮罩做出"点阵球面"的观感，DOM 排在 LiquidOrb
               canvas 之后 → 叠在球体之上。pointer-events-none，鼠标视差照旧
               落到下面的球体 canvas。整体随 orbWrap 一起做入场缩放，opacity
               由 applyDom 按 heroIn / 滚动进度驱动（滚动一动即随球体溶解淡出）。
               样式由 shell 调参对象驱动（见左侧「球体外壳调参」面板）。 */}
          <div
            ref={dotShellRef}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={dotShellStyle}
          />

          {/* ── 冰晶外壳：套在水晶球最外层的一层"结冰"包裹（见参考图）。
               形状是一圈微微起伏的有机块状轮廓，比球体大一圈、盖住球缘并
               探到浅底上。两层叠出玻璃厚度：
                 1) backdrop-filter 磨砂层——按 blob 形状裁剪，折射 / 模糊后面
                    的球体与浅底；
                 2) SVG 描边 + 高光——同一条 blob 路径，画出冰壳的边缘反光、
                    左上高光窗、右下环境光。
               整层 pointer-events-none，随 orbWrap 一起入场缩放，opacity 由
               applyDom 和点阵外壳同拍驱动（滚动一动即随球体溶解淡出）。 */}
          <div
            ref={iceShellRef}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `${shell.iceScalePct}%`,
              height: `${shell.iceScalePct}%`,
              opacity: 0,
              willChange: "opacity",
            }}
          >
            <svg width="0" height="0" className="absolute" aria-hidden>
              <defs>
                <clipPath id="hero-ice-blob" clipPathUnits="objectBoundingBox">
                  <path d={ICE_BLOB_PATH_UNIT} />
                </clipPath>
              </defs>
            </svg>

            <div
              className="ice-shell-sway absolute inset-0"
              style={{ "--ice-sway-deg": `${shell.iceSwayDeg}deg` } as CSSProperties}
            >
              {/* 1) 磨砂折射层：按 blob 裁剪 */}
              <div className="absolute inset-0" style={iceFrostStyle} />
              {/* 2) 边缘反光 + 高光窗：同一条路径 */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                <defs>
                  <filter id="hero-ice-soft" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="1.1" />
                  </filter>
                  <filter id="hero-ice-spec" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3.4" />
                  </filter>
                  <clipPath id="hero-ice-blob-px">
                    <path d={ICE_BLOB_PATH_PX} />
                  </clipPath>
                </defs>
                {/* 冰壳厚度的外缘亮线 */}
                <path
                  d={ICE_BLOB_PATH_PX}
                  fill="none"
                  stroke={hexToRgba("#ffffff", shell.iceRimOpacity)}
                  strokeWidth={shell.iceRimWidthPx}
                  filter="url(#hero-ice-soft)"
                />
                {/* 高光 / 环境光，裁到 blob 内 */}
                <g clipPath="url(#hero-ice-blob-px)" opacity={shell.iceSpecOpacity}>
                  <ellipse
                    cx="34" cy="30" rx="26" ry="15"
                    fill="rgba(255,255,255,0.9)"
                    filter="url(#hero-ice-spec)"
                    transform="rotate(-24 34 30)"
                  />
                  <ellipse
                    cx="72" cy="78" rx="22" ry="12"
                    fill="rgba(214,226,247,0.72)"
                    filter="url(#hero-ice-spec)"
                    transform="rotate(-18 72 78)"
                  />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* ── Hero 文案（左侧主叙事 + 右侧数据）──
             整层 pointer-events-none，否则这块 absolute inset-0 的浮层会盖在
             球上、把 pointermove 全吃掉 → 球失去鼠标视差。导航是独立 fixed 层（HomeNav）。 */}
        <div
          ref={heroRef}
          className="pointer-events-none absolute inset-0 text-[#171717]"
          style={{
            opacity: 0,
            willChange: "opacity, transform",
            transformOrigin: "50% 52%",
          }}
        >
          {/* 左右两块都用 lg:flex-col + lg:gap-6，三段之间盒到盒间距严格 24px；
              各元素 leading 收到接近字身高，抵消行盒余白，让左右两侧的视觉间距一致。 */}
          <div className="absolute inset-x-6 top-[49%] z-10 lg:bottom-[15%] lg:left-[6.5%] lg:right-auto lg:top-auto lg:flex lg:w-[min(32vw,620px)] lg:flex-col lg:items-start lg:gap-6">
            <p className="flex items-center gap-2 text-[13px] font-medium tracking-[0.01em] text-black/65 lg:hidden">
              <span aria-hidden className="size-1.5 rounded-full bg-[#a56de2]" />
              <span>让 AI 从认知走向价值</span>
              <span aria-hidden className="ml-1 h-5 w-px bg-[#b18be0]/60" />
            </p>

            <h1 className="mt-5 text-[clamp(3rem,12vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.075em] text-[#121212] lg:mt-0 lg:text-[150px] lg:font-extrabold lg:leading-[0.9] lg:tracking-[-0.06em]">
              新岛
            </h1>

            {/* Figma：w-[420px] 里自然换行成两行，别硬拆 span（拆点和 420px 边界不一致会变三行） */}
            <p className="mt-5 max-w-[300px] text-[12px] leading-[1.8] text-[#7a7a7a] lg:mt-0 lg:w-[420px] lg:max-w-none lg:text-[14px] lg:leading-[20px]">
              专注于人工智能领域的知识服务与工程落地。以 AI 社群保持认知领先，以 FDE 驱动工程落地，从社区到前沿部署一站式对接。
            </p>

            <div className="pointer-events-auto mt-5 flex items-center gap-5 lg:mt-0 lg:gap-8">
              <CtaButton href="/register" size="md">
                加入岛屿
              </CtaButton>
              <CtaButton href="#about" variant="ghost" size="md" className="lg:hidden">
                了解更多
              </CtaButton>
            </div>
          </div>

          <div className="absolute bottom-[5%] right-6 z-10 text-right lg:bottom-[15%] lg:right-[6.5%] lg:top-auto lg:flex lg:w-[311px] lg:flex-col lg:items-start lg:gap-6 lg:text-left">
            <p className="hidden whitespace-nowrap text-[16px] font-medium leading-none tracking-[-0.01em] text-[#4a4a4a] lg:block">
              让 AI 从认知走向价值，从价值驱动未来变革
            </p>
            <p className="font-semibold leading-none tracking-[-0.065em] text-[clamp(3rem,12vw,4rem)] text-[#121212] lg:mt-0 lg:text-[40px] lg:font-extrabold lg:leading-none lg:tracking-[-0.03em]">
              200k
            </p>
            <p className="mt-2 text-[11px] text-[#7a7a7a] lg:mt-0 lg:text-[14px] lg:leading-none">AI社群成员累计</p>
          </div>

          {/* ── 滚动提示：Hero 底部居中的鼠标滚轮 icon。放在 heroRef 层内 →
               跟 Hero 文案一起入场淡入、滚动一动就淡出。 */}
          <div
            aria-hidden
            className="absolute bottom-[5%] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-[6.5%]"
          >
            <span className="scroll-cue relative block h-9 w-[22px] rounded-full border-[1.5px] border-black/30">
              <span className="scroll-cue-wheel absolute left-1/2 top-[6px] h-[6px] w-[2px] -translate-x-1/2 rounded-full bg-black/40" />
            </span>
          </div>
        </div>

        {/* 悬浮胶囊导航已移到独立的 fixed 顶层组件 HomeNav（VariantEditorial 渲染），
            以保证它永远盖在所有内容 / 转场效果之上、不随本 sticky 舞台滚走。 */}

        {/* ── 穿壳微光（柔和一闪） ── */}
        <div
          ref={flashRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{
            background:
              "radial-gradient(circle at 50% 48%, rgba(244,246,252,0.95), rgba(205,210,226,0.72) 42%, rgba(146,153,178,0.4) 78%), rgba(120,127,150,0.4)",
            willChange: "opacity",
          }}
        />

        {/* ── 进入水晶球后浮现的主营业务介绍：整体淡入后随滚动逐字填实。
             每个字是 .uv-fill-char，读容器上的 --fill 决定亮到什么程度；
             AI 社群 / FDE 是可点击按钮，按帧切换 pointerEvents（applyDom）。 ── */}
        <div
          ref={eyebrowRef}
          className="pointer-events-none absolute left-1/2 top-[40%] z-10 w-[min(820px,92vw)] text-center opacity-0"
          style={
            { transform: "translate(-50%, 0)", willChange: "opacity, transform", "--fill": 0 } as CSSProperties
          }
        >
          <p
            className="text-[clamp(1.2rem,2.9vw,1.75rem)] font-normal leading-[1.95] tracking-[0.01em] text-white"
            style={{ textShadow: "0 1px 18px rgba(8,6,17,0.9)" }}
          >
            <ParagraphFillText />
          </p>
        </div>

        {/* 收尾过渡缝改为单层：见 AiCommunityCarousel 顶部的 .seam-arc。 */}

        {/* ── 两侧边注：Hero 文案淡尽后浮现，填补浅色底左右的空白，
             在中心那段业务介绍浮现前淡出。命令式驱动，桌面才显示。 */}
        <div
          ref={leftAsideRef}
          aria-hidden
          className="pointer-events-none absolute left-[6%] top-1/2 z-10 hidden whitespace-nowrap text-[clamp(1.5rem,2.6vw,2.35rem)] font-medium tracking-[-0.02em] text-[#171717] opacity-0 lg:block xl:left-[9%]"
          style={{ transform: "translate(0, -50%)", willChange: "opacity, transform" }}
        >
          从认知到实践
        </div>

        <div
          ref={rightAsideRef}
          aria-hidden
          className="pointer-events-none absolute right-[6%] top-1/2 z-10 hidden whitespace-nowrap text-[clamp(1.5rem,2.6vw,2.35rem)] font-medium tracking-[-0.02em] text-[#171717] opacity-0 lg:block xl:right-[9%]"
          style={{ transform: "translate(0, -50%)", willChange: "opacity, transform" }}
        >
          从价值到变革
        </div>

        {/* ── reduced-motion 静态兜底：深空 + 整段文案 ── */}
        <div
          ref={staticRef}
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(820px,90vw)] -translate-x-1/2 -translate-y-1/2 px-2 text-center opacity-0"
        >
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -z-10 h-[150%] w-[130%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(8,6,17,0.75), rgba(8,6,17,0.4) 55%, transparent 78%)",
            }}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-[#9aa1bb]">
            新岛 · NOVAISLAND
          </p>
          <p
            className="mt-7 text-[17px] leading-[2.05] tracking-[0.02em] text-white/85 md:text-[20px]"
            style={{ textShadow: "0 1px 18px rgba(8,6,17,0.9)" }}
          >
            {PARAGRAPH}
          </p>
        </div>
      </div>

      {SHELL_DEV &&
        panelMounted &&
        createPortal(
          // portal 到 body：本组件外层有 sticky / transform，fixed 会失效。
          // 水晶球本体面板在右侧（LiquidOrb 自带），外壳面板放左侧。
          <div className="fixed bottom-3 left-3 top-[72px] z-[9999] w-0">
            <TuningPanelShell
              title="球体外壳调参（仅开发环境）"
              widthClassName="w-[290px]"
              positionClassName="left-0 top-0"
            >
              <p className="text-[11px] font-medium text-[#78716c]">点阵外壳</p>
              <CommitSlider label="直径" value={shell.dotScalePct} min={30} max={110} step={1} unit="%" onCommit={(v) => setShell((s) => ({ ...s, dotScalePct: v }))} />
              <CommitSlider label="间距" value={shell.dotGapPx} min={4} max={28} step={0.5} unit="px" onCommit={(v) => setShell((s) => ({ ...s, dotGapPx: v }))} />
              <CommitSlider label="点径" value={shell.dotSizePx} min={0.4} max={3} step={0.1} unit="px" onCommit={(v) => setShell((s) => ({ ...s, dotSizePx: v }))} />
              <CommitSlider label="点透明" value={shell.dotOpacity} min={0} max={1} step={0.05} unit="" onCommit={(v) => setShell((s) => ({ ...s, dotOpacity: v }))} />
              <CommitSlider label="遮罩内" value={shell.dotMaskInnerPct} min={0} max={70} step={1} unit="%" onCommit={(v) => setShell((s) => ({ ...s, dotMaskInnerPct: v }))} />
              <CommitSlider label="遮罩外" value={shell.dotMaskOuterPct} min={40} max={100} step={1} unit="%" onCommit={(v) => setShell((s) => ({ ...s, dotMaskOuterPct: v }))} />
              <CommitColorPicker label="点色" value={shell.dotColor} onCommit={(v) => setShell((s) => ({ ...s, dotColor: v }))} />

              <p className="mt-1 border-t border-black/[0.06] pt-3 text-[11px] font-medium text-[#78716c]">
                冰晶外壳
              </p>
              <CommitSlider label="直径" value={shell.iceScalePct} min={100} max={175} step={1} unit="%" onCommit={(v) => setShell((s) => ({ ...s, iceScalePct: v }))} />
              <CommitSlider label="磨砂" value={shell.iceBlurPx} min={0} max={20} step={0.5} unit="px" onCommit={(v) => setShell((s) => ({ ...s, iceBlurPx: v }))} />
              <CommitSlider label="提亮" value={shell.iceBrightnessPct} min={80} max={140} step={1} unit="%" onCommit={(v) => setShell((s) => ({ ...s, iceBrightnessPct: v }))} />
              <CommitSlider label="白度" value={shell.iceFrostOpacity} min={0} max={1} step={0.05} unit="" onCommit={(v) => setShell((s) => ({ ...s, iceFrostOpacity: v }))} />
              <CommitSlider label="边光亮" value={shell.iceRimOpacity} min={0} max={1} step={0.02} unit="" onCommit={(v) => setShell((s) => ({ ...s, iceRimOpacity: v }))} />
              <CommitSlider label="边光宽" value={shell.iceRimWidthPx} min={0} max={4} step={0.1} unit="px" onCommit={(v) => setShell((s) => ({ ...s, iceRimWidthPx: v }))} />
              <CommitSlider label="高光" value={shell.iceSpecOpacity} min={0} max={1} step={0.05} unit="" onCommit={(v) => setShell((s) => ({ ...s, iceSpecOpacity: v }))} />
              <CommitSlider label="摆动" value={shell.iceSwayDeg} min={0} max={8} step={0.5} unit="°" onCommit={(v) => setShell((s) => ({ ...s, iceSwayDeg: v }))} />

              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => console.log("SHELL tuning:\n" + JSON.stringify(shell, null, 2))}
                  className="flex-1 rounded-full border border-black/[0.08] px-2 py-1 text-[11px] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
                >
                  打印当前数值
                </button>
                <button
                  type="button"
                  onClick={() => setShell(SHELL_DEFAULTS)}
                  className="flex-1 rounded-full border border-black/[0.08] px-2 py-1 text-[11px] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
                >
                  重置
                </button>
              </div>
            </TuningPanelShell>
          </div>,
          document.body,
        )}
    </section>
  );
}
