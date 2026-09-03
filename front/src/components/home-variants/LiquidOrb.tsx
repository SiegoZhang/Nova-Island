"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";

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

// 方案 B Hero 正中的「水晶球」。一块正对相机的方片 impostor：圆形、球面法线、
// 折射、色散全部在片元里解析计算——圆边永远光滑，色散在边缘天然最强。
//
// 观感参照透明水晶球：清透玻璃质感 + 边缘彩色色散 + 内部柔和的紫色星云和
// 微弱星点 + 左上玻璃高光。整体走浅色（白球白底），靠色散彩边、折射暗环、
// 高光和接触阴影把球「读」出来。
//
// 鼠标悬停：光标附近的内部云雾被搅动（域扭曲）；球随光标轻微视差倾斜。
//
// 开发环境右上角有调参面板（TuningPanelShell），滑块实时改 shader uniform、
// 不重建场景，数值存 localStorage。调好后把 ORB_DEFAULTS / ORB_COLOR_DEFAULTS
// 抄成新默认值即可（面板里「打印当前数值」按钮会 console.log 出来）。

const R = 1.0;
const ORB_CAMERA_FOV = 38;
const ORB_CAMERA_DISTANCE = 3.55;

// ── 可调默认值 ────────────────────────────────────────────────
const ORB_DEFAULTS = {
  ior: 1.47, // 折射率（基准）
  dispersion: 0.03, // 色散：R/B 通道折射率相对基准的偏移
  nebScale: 1.3, // 星云噪声缩放（大→细碎）
  nebFloor: 0.07, // 星云保底浓度（整体淡紫霾）
  nebContrast: 1.15, // 星云对比（pow 指数，大→更多留白）
  flowSpeed: 0.03, // 星云流动速度
  starThreshold: 0.87, // 星点密度阈值（小→星更多）
  starBright: 0.9, // 星点亮度
  rimPow: 4.5, // 边缘色散的收窄程度（大→更细）
  rimBright: 1.0, // 边缘色散亮度
  darkRing: 0.2, // 折射暗环强度（0..0.9）
  caustic: 0.28, // 焦散亮斑强度
  specBright: 2.6, // 玻璃高光窗亮度
  parallaxAmt: 0.1, // 跟随鼠标的视差倾斜量
  orbScale: 1.0, // 球体视觉大小（CSS scale 整个 canvas，不影响排版）
};
type OrbTuning = typeof ORB_DEFAULTS;

const ORB_COLOR_DEFAULTS = {
  lilac: "#ccb3eb", // 星云-淡（低浓度）
  violet: "#8c57c7", // 星云-中
  indigo: "#332161", // 星云-浓
};
type OrbColors = typeof ORB_COLOR_DEFAULTS;

// 直接把 #rrggbb 解析成 0..1 原始值传进 vec3 uniform（不走 THREE.Color 的
// sRGB→linear 转换）——这样调参面板取色器里显示的颜色 = 球上渲染出来的
// 颜色，所见即所得。
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

const DEV_TUNING_ENABLED = process.env.NODE_ENV !== "production";
// 恢复原球体材质时同步恢复 v3，本机曾调整的旧观感也能继续读回。
const STORAGE_KEY = "novaisland:liquid-orb:v3";

function loadStored(): { tuning: OrbTuning; colors: OrbColors } {
  const fallback = { tuning: ORB_DEFAULTS, colors: ORB_COLOR_DEFAULTS };
  if (!DEV_TUNING_ENABLED || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<{
      tuning: Partial<OrbTuning>;
      colors: Partial<OrbColors>;
    }>;
    return {
      tuning: { ...ORB_DEFAULTS, ...parsed.tuning },
      colors: { ...ORB_COLOR_DEFAULTS, ...parsed.colors },
    };
  } catch {
    return fallback;
  }
}

const GLSL_NOISE = /* glsl */ `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // 3 个倍频就够——这个 shader 每像素要算好几次，octave 多了集显跑不动。
  float fbm(vec3 p){
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * snoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  // 点状星场：格子里每格一颗随机亮星，远离格心快速衰减。纯 hash，很便宜。
  float stars(vec3 rd, float scale, float thr) {
    vec3 g = rd * scale;
    vec3 id = floor(g);
    vec3 f = fract(g) - 0.5;
    float h = fract(sin(dot(id, vec3(12.99, 78.23, 37.72))) * 43758.545);
    float present = step(thr, h);
    float d = length(f);
    return present * pow(1.0 - smoothstep(0.0, 0.34, d), 3.0) * (0.55 + 0.45 * fract(h * 91.7));
  }
`;

// 圆略小于画布，四周留一圈透明边距，避免 canvas 矩形边缘的抗锯齿压在球轮廓上。
const PLANE_SCALE = 1.08;

// 可见球体半径 / WebGL canvas 高度。UniverseTransition 用它把星场的
// clip-path 与 shader 中 rad < 1.0 的真实球缘对齐，不再根据外层 DOM 宽度估算。
export const LIQUID_ORB_VISIBLE_RADIUS_RATIO =
  (R / PLANE_SCALE) /
  (2 * ORB_CAMERA_DISTANCE * Math.tan((ORB_CAMERA_FOV * Math.PI) / 360));

const ORB_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy * ${PLANE_SCALE.toFixed(3)};   // PlaneGeometry(2,2) → xy ∈ [-${PLANE_SCALE.toFixed(3)}, ${PLANE_SCALE.toFixed(3)}]
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORB_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2  uParallax;
  uniform vec2  uPointer;
  uniform float uPointerActivity;

  uniform float uIor;
  uniform float uDispersion;
  uniform float uNebScale;
  uniform float uNebFloor;
  uniform float uNebContrast;
  uniform float uFlowSpeed;
  uniform float uStarThreshold;
  uniform float uStarBright;
  uniform float uRimPow;
  uniform float uRimBright;
  uniform float uDarkRing;
  uniform float uCaustic;
  uniform float uSpecBright;
  uniform float uParallaxAmt;
  uniform float uDissolve;    // 0→1：玻璃外层溶解、内部流动加速、露出后面的星空
  uniform float uReveal;      // 0→1：入场揭示。0 = 球内空、反光极淡；1 = 完全成形
  uniform vec3  uColLilac;
  uniform vec3  uColViolet;
  uniform vec3  uColIndigo;
  uniform vec3  uPageColor;

  varying vec2 vP;

  ${GLSL_NOISE}

  // 星云密度 0..1（一次 fbm）。P = 折射光线在球内的采样点。
  float nebulaDensity(vec3 P, float stir) {
    // 溶解时内部流动明显加速、加一层额外域扭曲
    vec3 q = P * uNebScale + vec3(0.0, 0.0, uTime * uFlowSpeed * (1.0 + uDissolve * 4.5));
    q.xy += stir * 0.5 * vec2(sin(uTime * 0.9 + P.y * 3.0), cos(uTime * 0.8 + P.x * 3.0));
    q.xy += uDissolve * 0.6 * vec2(sin(uTime * 0.6 + P.y * 2.4), cos(uTime * 0.55 + P.x * 2.4));
    float d = smoothstep(-0.5, 0.5, fbm(q));
    return clamp(pow(d, uNebContrast) * (1.0 - uNebFloor) + uNebFloor, 0.0, 1.0);
  }

  // 密度 → 颜色（纯 mix，很便宜；三通道分别用各自折射的密度采样即成色散）。
  vec3 nebulaColor(float density) {
    vec3 neb = mix(uColLilac, uColViolet, smoothstep(0.12, 0.55, density));
    neb = mix(neb, uColIndigo, smoothstep(0.5, 1.0, density));
    // 溶解时把低密度区的近白基色强力推向淡紫，避免残块看着像灰玻璃
    vec3 base = mix(vec3(0.955, 0.955, 0.965), uColLilac * 1.05, clamp(uDissolve * 1.35, 0.0, 0.92));
    return mix(base, neb, clamp(density * 1.05, 0.0, 1.0));
  }

  void main() {
    float rad = length(vP);

    // 圆外：完全透明并 return。圆内：一律不透明（alpha=1）。
    // 「黑边」的根因是边缘那圈半透明像素——不管 shader 输出预乘还是直通，
    // three 混进透明缓冲会乘一次 alpha、浏览器合成这张 canvas 图层又乘一次，
    // 半透明像素被 alpha 平方、整体压暗，抗锯齿过渡带最明显 = 一圈灰/黑描边。
    // 所以干脆不留半透明：球是实心的，靠下面 col 在最外一圈渐隐到底色，
    // 让「轮廓」由颜色渐变定义，硬 alpha 切在已经等于底色的地方，合成无缝。
    if (rad >= 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // 由圆形坐标重建球面法线（指向相机 +Z）
    float zc = sqrt(max(1.0 - rad * rad, 1e-4));
    vec3 N = normalize(vec3(vP + uParallax * uParallaxAmt, zc));
    float facing = clamp(N.z, 0.0, 1.0);
    vec3 I = vec3(0.0, 0.0, -1.0);

    float stir = uPointerActivity * smoothstep(0.85, 0.0, length(vP - uPointer));

    vec3 entry = vec3(vP, zc);
    vec3 tR = refract(I, N, 1.0 / (uIor - uDispersion));
    vec3 tG = refract(I, N, 1.0 / uIor);
    vec3 tB = refract(I, N, 1.0 / (uIor + uDispersion));

    // 三通道各用自己折射率的采样点取星云密度 → 天然色散
    float dR = nebulaDensity(entry + tR * 1.7, stir);
    float dG = nebulaDensity(entry + tG * 1.7, stir);
    float dB = nebulaDensity(entry + tB * 1.7, stir);
    vec3 col = vec3(nebulaColor(dR).r, nebulaColor(dG).g, nebulaColor(dB).b);
    // 星点
    float st = stars(tG, 40.0, uStarThreshold) + 0.55 * stars(tG + 9.0, 74.0, uStarThreshold);
    col -= smoothstep(0.02, 0.25, st) * 0.05;
    col = mix(col, vec3(1.0), clamp(st * (uStarBright + 0.3 * stir), 0.0, 1.0));

    // —— 入场 uReveal 0→1：小球时球内**全透明**（只有玻璃壳的反光/色散），
    // 随球放大，星云与星尘从透明里逐渐「注入显影」到正常浓度。0 时把星云星尘
    // 整体压回「清透玻璃透出的浅底」，>=1 时完全恢复。 ——
    float fill = clamp(uReveal, 0.0, 1.0);
    vec3 clearInside = mix(uPageColor, vec3(1.0), 0.30); // 空玻璃球透出的浅底
    col = mix(clearInside, col, fill);

    // —— 溶解：从球心一点开始，随 uDissolve 向外扩成一个流动的圆形缺口 ——
    // 缺口内部 = 透明，露出后面的星空；边界随噪声流动、扭动。
    float gone = 0.0;       // 1 = 这块已溶掉（露出后面星空）
    float glassMask = 1.0;  // 玻璃层高光 / 色散 / 反光的存留系数
    float front = 0.0;      // 溶解锋面（发亮的热边）
    if (uDissolve > 0.001) {
      // 流动噪声：让溶解锋面**轻微**扭动（幅度要小——外面用圆形 clip 露真星空，
      // 扭太狠俩形状对不上就会露出浅底）
      float fl = fbm(vec3(vP * 2.6, uTime * 0.25)) - 0.5;
      fl += (fbm(vec3(vP * 5.4, uTime * 0.32 + 11.0)) - 0.5) * 0.4;
      // 溶解半径：uDissolve 0→1 时从球心 0 长到 ~1.35（略超出球缘）
      float eat = uDissolve * 1.35;
      // 到「溶解锋面」的有符号距离：<0 已溶掉，>0 还是玻璃
      float sd = rad - eat + fl * (0.05 - uDissolve * 0.015);
      gone = 1.0 - smoothstep(-0.05, 0.11, sd);
      glassMask = (1.0 - gone) * (1.0 - uDissolve * 0.9);
      // 锋面微光：从硬切位置(sd≈0.03)朝**实心内侧**柔和衰减的一层极淡暖光。
      // 关键：亮度峰值就贴在切口上、往里渐隐，**不是**一条离边缘还有距离的
      // 独立亮环——offset 的亮环会被眼睛读成一圈白描边（之前就是这个问题）。
      // 强度压到很低，只用来把硬切锯齿糊掉，不喧宾夺主。
      front = (1.0 - smoothstep(0.03, 0.12, sd)) * (1.0 - uDissolve * 0.35);
    }

    // 折射暗环——收在球内侧
    float refrRing = smoothstep(0.55, 0.8, rad) * (1.0 - smoothstep(0.8, 0.96, rad));
    col = mix(col, col * (1.0 - uDarkRing), refrRing * glassMask);

    // 焦散亮斑
    float caustic = 1.0 - smoothstep(0.0, 0.42, length(vP - vec2(-0.05, -0.22)));
    col += caustic * caustic * vec3(1.0, 0.98, 1.0) * uCaustic * glassMask;

    // 体积渐变：往边缘极轻压暗
    col *= 1.0 - smoothstep(0.2, 1.0, rad) * 0.05;

    // 大面积光滑反光扫过
    float sweepA = smoothstep(0.45, 0.95, dot(N, normalize(vec3(-0.55, 0.8, 0.5))));
    col = mix(col, vec3(1.0), sweepA * 0.14 * glassMask);

    // —— 边缘色散：绕圈变色的薄彩虹边 + RGB 碎点 ——
    float fres = pow(1.0 - facing, uRimPow);
    float edge = smoothstep(0.9, 1.0, rad);
    // ang 系数取 3/2π ≈ 0.47746：绕球一圈正好 3 个整数色相循环，
    // 这样 atan 在左边缘（-x 轴）的 ±π 分支切口两侧相位差正好是 3·2π，连续。
    float ang = atan(vP.y, vP.x);
    vec3 rimIrid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.66) + ang * 0.47746 + rad * 1.5 + uTime * 0.04));
    col += (fres * uRimBright + edge * 0.35) * rimIrid * glassMask;

    float spk = edge * 1.0 + fres * 0.7;
    col.r += stars(vec3(vP * 3.0, 0.0), 14.0, 0.87) * spk * 1.3 * glassMask;
    col.g += stars(vec3(vP * 3.0, 5.0), 14.0, 0.87) * spk * 1.3 * glassMask;
    col.b += stars(vec3(vP * 3.0, 9.0), 14.0, 0.87) * spk * 1.3 * glassMask;

    // 最外一条亮白细边
    float rimLine = smoothstep(0.05, 0.0, facing);
    col += rimLine * 0.7 * glassMask;

    // 玻璃高光窗（左上）
    vec3 specDir = normalize(vec3(-0.45, 0.6, 0.95));
    float sd = clamp(dot(N, specDir), 0.0, 1.0);
    col += pow(sd, 250.0) * uSpecBright * glassMask;
    col += pow(sd, 26.0) * 0.14 * glassMask;

    // 右下缘环境反光
    vec3 rimDir = normalize(vec3(0.5, -0.5, 0.35));
    col += pow(clamp(dot(N, rimDir), 0.0, 1.0), 5.0) * fres * 0.9 * glassMask;

    // 溶解带整体抬亮到淡紫：色值收到 *1.05（不再 *1.25 clamp 成粉白）、
    // 混合量封顶 0.6——切口内侧是一层柔和淡紫，不是一条亮白环。
    col = mix(col, uColLilac * 1.05, smoothstep(0.04, 0.30, gone) * 0.6);
    // 锋面：贴着切口往里渐隐的一层极淡暖光，把硬切锯齿糊进去。亮度 0.35，
    // 不烧成白圈。
    col += front * uColLilac * 0.35;

    // 外缘渐隐到页面浅底：圆外永远是浅底，保证轮廓与浅底无缝（无描边）。
    col = mix(col, uPageColor, smoothstep(0.62, 0.88, rad) * 0.5);
    col = mix(col, uPageColor, smoothstep(0.90, 0.985, rad));

    // —— 溶解掉的部分 → 透明，露出 orbWrap 后面那张真正的 3D 星空 canvas ——
    // **硬切** alpha（gone≤0.5 实心 / >0.5 透明），零半透明像素 → 彻底没有
    // 「半透明 canvas 像素被三渲染 + 浏览器合成各乘一次 alpha」压出来的灰/黑环。
    // 硬切的锯齿边正好落在上面那条发光锋面里，看不出来。
    float alpha = step(gone, 0.5);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha); // 预乘
  }
`;

// 页面底色（#edecea）。球的最外一圈会融进这个颜色来消除描边——如果放到
// 别的底色上，把对应 hex 传进来。
const DEFAULT_PAGE_COLOR = "#edecea";

export function LiquidOrb({
  className,
  pageColor = DEFAULT_PAGE_COLOR,
  debug = true,
  interactive = true,
  dissolveRef,
  revealRef,
  onBackgroundColorCommit,
}: {
  className?: string;
  pageColor?: string;
  /** 是否显示开发环境调参面板。页面上有多个 LiquidOrb 时只让一个开着。 */
  debug?: boolean;
  /** 是否响应鼠标（搅动 / 视差）。放大做转场时关掉。 */
  interactive?: boolean;
  /** 外部按帧写入的溶解进度 0..1（转场用）。用 ref 避免每帧 re-render。 */
  dissolveRef?: { current: number };
  /** 外部按帧写入的入场揭示进度 0..1（Hero 进场动画用）。1 = 完全成形。 */
  revealRef?: { current: number };
  /**
   * 调参面板里拖「背景色」取色器松手时回调，把新 hex 交给外层去改真正
   * 的 Hero 页面背景（球体本身不持有背景色状态，只透传 pageColor prop
   * 驱动 uPageColor uniform）。不传就只在面板里显示，不影响任何东西。
   */
  onBackgroundColorCommit?: (hex: string) => void;
}) {
  const showPanel = DEV_TUNING_ENABLED && debug;
  // 面板要 portal 到 body：LiquidOrb 可能被外层 transform（转场里球会 CSS scale），
  // `position: fixed` 在 transform 祖先里会相对那个祖先定位、还跟着一起缩放。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const uniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);

  // 一个 state 对象装 tuning + colors——只在挂载时 setState 一次（读 localStorage），
  // 分成两个 useState 会在 effect 里连续 setState 两次触发 lint。
  const [config, setConfig] = useState<{ tuning: OrbTuning; colors: OrbColors }>({
    tuning: ORB_DEFAULTS,
    colors: ORB_COLOR_DEFAULTS,
  });
  const { tuning, colors } = config;
  const setTuning = (fn: (p: OrbTuning) => OrbTuning) =>
    setConfig((c) => ({ ...c, tuning: fn(c.tuning) }));
  const setColors = (fn: (p: OrbColors) => OrbColors) =>
    setConfig((c) => ({ ...c, colors: fn(c.colors) }));

  // 挂载后（仅开发环境）读回上次调参。放 effect 里避免 SSR/首帧 hydration 不一致。
  useEffect(() => {
    if (!DEV_TUNING_ENABLED) return;
    setConfig(loadStored());
  }, []);

  // 调参落盘
  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (!DEV_TUNING_ENABLED || typeof window === "undefined") return;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* 隐私模式/配额：忽略 */
    }
  }, [config]);

  // 调参值 → uniform（不重建场景）
  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    u.uIor.value = tuning.ior;
    u.uDispersion.value = tuning.dispersion;
    u.uNebScale.value = tuning.nebScale;
    u.uNebFloor.value = tuning.nebFloor;
    u.uNebContrast.value = tuning.nebContrast;
    u.uFlowSpeed.value = tuning.flowSpeed;
    u.uStarThreshold.value = tuning.starThreshold;
    u.uStarBright.value = tuning.starBright;
    u.uRimPow.value = tuning.rimPow;
    u.uRimBright.value = tuning.rimBright;
    u.uDarkRing.value = tuning.darkRing;
    u.uCaustic.value = tuning.caustic;
    u.uSpecBright.value = tuning.specBright;
    u.uParallaxAmt.value = tuning.parallaxAmt;
    (u.uColLilac.value as THREE.Vector3).fromArray(hexToRgb(colors.lilac));
    (u.uColViolet.value as THREE.Vector3).fromArray(hexToRgb(colors.violet));
    (u.uColIndigo.value as THREE.Vector3).fromArray(hexToRgb(colors.indigo));
    // 球体大小：直接 CSS scale 整个 canvas（视觉变化，不触发 resize / 不影响排版）
    if (containerRef.current) {
      containerRef.current.style.transform = `scale(${tuning.orbScale})`;
    }
    renderOnceRef.current?.();
  }, [tuning, colors]);

  // 页面底色 → uniform（换底色时同步，不重建场景）
  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    (u.uPageColor.value as THREE.Vector3).fromArray(hexToRgb(pageColor));
    renderOnceRef.current?.();
  }, [pageColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = prefersReducedMotion();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(ORB_CAMERA_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, ORB_CAMERA_DISTANCE);

    // 球体片元一律输出 alpha=1（实心），圆外输出全透明。不留任何半透明像素——
    // 半透明像素会被 three 的混合 + 浏览器图层合成各乘一次 alpha、整体压暗，
    // 就是之前球边那圈怎么都去不掉的灰/黑描边。球的「边」靠 col 渐隐到底色实现。
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uParallax: { value: new THREE.Vector2(0, 0) },
      uPointer: { value: new THREE.Vector2(999, 999) },
      uPointerActivity: { value: 0 },
      uIor: { value: ORB_DEFAULTS.ior },
      uDispersion: { value: ORB_DEFAULTS.dispersion },
      uNebScale: { value: ORB_DEFAULTS.nebScale },
      uNebFloor: { value: ORB_DEFAULTS.nebFloor },
      uNebContrast: { value: ORB_DEFAULTS.nebContrast },
      uFlowSpeed: { value: ORB_DEFAULTS.flowSpeed },
      uStarThreshold: { value: ORB_DEFAULTS.starThreshold },
      uStarBright: { value: ORB_DEFAULTS.starBright },
      uRimPow: { value: ORB_DEFAULTS.rimPow },
      uRimBright: { value: ORB_DEFAULTS.rimBright },
      uDarkRing: { value: ORB_DEFAULTS.darkRing },
      uCaustic: { value: ORB_DEFAULTS.caustic },
      uSpecBright: { value: ORB_DEFAULTS.specBright },
      uParallaxAmt: { value: ORB_DEFAULTS.parallaxAmt },
      uDissolve: { value: 0 },
      uReveal: { value: revealRef ? 0 : 1 },
      uColLilac: { value: new THREE.Vector3(...hexToRgb(ORB_COLOR_DEFAULTS.lilac)) },
      uColViolet: { value: new THREE.Vector3(...hexToRgb(ORB_COLOR_DEFAULTS.violet)) },
      uColIndigo: { value: new THREE.Vector3(...hexToRgb(ORB_COLOR_DEFAULTS.indigo)) },
      uPageColor: { value: new THREE.Vector3(...hexToRgb(pageColor)) },
    };
    uniformsRef.current = uniforms;

    const geo = new THREE.PlaneGeometry(2 * R, 2 * R);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: ORB_VERT,
      fragmentShader: ORB_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const orb = new THREE.Mesh(geo, mat);
    scene.add(orb);

    // ── 指针 ──────────────────────────────────────────────────
    let pointerActivityTarget = 0;
    const parallax = new THREE.Vector2(0, 0);
    const parallaxTarget = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(999, 999);

    function updatePointer(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const halfPlaneOnScreen =
        R / (camera.position.z * Math.tan((camera.fov * Math.PI) / 360));
      // 乘 PLANE_SCALE：顶点里 vP = position.xy * PLANE_SCALE，uPointer 要落到同一坐标系
      pointerTarget.set(
        (((nx * 2 - 1) * (rect.width / rect.height)) / halfPlaneOnScreen) * PLANE_SCALE,
        (-(ny * 2 - 1) / halfPlaneOnScreen) * PLANE_SCALE,
      );
      parallaxTarget.set(nx * 2 - 1, -(ny * 2 - 1));
      pointerActivityTarget = 1;
    }

    function handlePointerLeave() {
      pointerActivityTarget = 0;
      parallaxTarget.set(0, 0);
    }

    if (interactive) {
      renderer.domElement.addEventListener("pointermove", updatePointer, { passive: true });
      renderer.domElement.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    }

    // ── 尺寸 / 循环 / 可见性 ─────────────────────────────────
    let raf = 0;
    let running = false;
    let isVisible = true;
    const startTime = performance.now();

    function renderOnce() {
      renderer.render(scene, camera);
    }
    renderOnceRef.current = renderOnce;

    function resize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      // 片元着色偏重，但转场末段球会被 CSS 放大到铺满整屏，渲染缓冲要够密。
      const dpr = Math.min(2.2, getClampedDpr() * 1.4);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderOnce();
    }

    function frame(now: number) {
      const elapsed = (now - startTime) / 1000;
      uniforms.uTime.value = elapsed;

      const act = uniforms.uPointerActivity.value as number;
      uniforms.uPointerActivity.value = act + (pointerActivityTarget - act) * 0.07;
      parallax.x += (parallaxTarget.x - parallax.x) * 0.045;
      parallax.y += (parallaxTarget.y - parallax.y) * 0.045;
      (uniforms.uParallax.value as THREE.Vector2).set(parallax.x, parallax.y);
      (uniforms.uPointer.value as THREE.Vector2).lerp(pointerTarget, 0.15);
      if (dissolveRef) uniforms.uDissolve.value = dissolveRef.current;
      if (revealRef) uniforms.uReveal.value = revealRef.current;

      renderOnce();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduceMotion || !isVisible) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    if (reduceMotion) renderOnce();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);

    const disposeVisibility = createVisibilityLifecycle(container, {
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
      disposeVisibility();
      renderer.domElement.removeEventListener("pointermove", updatePointer);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      uniformsRef.current = null;
      renderOnceRef.current = null;
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // pageColor 只用于 uniform 初始值（运行中变化由独立 effect 同步）；
    // interactive 挂载时定死，不会运行时切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        aria-hidden="true"
        className={className}
        style={{
          pointerEvents: interactive ? "auto" : "none",
          transformOrigin: "center",
          transform: `scale(${config.tuning.orbScale})`,
        }}
      />
      {showPanel && mounted && createPortal(
        // portal 到 body：外层可能有 transform，fixed 会失效。外壳固定在屏幕
        // 右侧，要有真实高度，TuningPanelShell 内部 max-h:calc(100%-24px) 才有意义。
        <div className="fixed right-3 top-[72px] bottom-3 z-[9999] w-0">
        <TuningPanelShell
          title="水晶球调参（仅开发环境）"
          widthClassName="w-[290px]"
          positionClassName="right-0 top-0"
        >
          <div className="flex flex-col gap-2">
            <CommitSlider label="球体大小" value={tuning.orbScale} min={0.4} max={1.8} step={0.02} unit="×" onCommit={(v) => setTuning((p) => ({ ...p, orbScale: v }))} />
            <CommitSlider label="折射率" value={tuning.ior} min={1.3} max={1.95} step={0.01} unit="" onCommit={(v) => setTuning((p) => ({ ...p, ior: v }))} />
            <CommitSlider label="色散" value={tuning.dispersion} min={0} max={0.14} step={0.002} unit="" onCommit={(v) => setTuning((p) => ({ ...p, dispersion: v }))} />
            <CommitSlider label="云缩放" value={tuning.nebScale} min={0.4} max={3.5} step={0.05} unit="" onCommit={(v) => setTuning((p) => ({ ...p, nebScale: v }))} />
            <CommitSlider label="云底噪" value={tuning.nebFloor} min={0} max={0.5} step={0.01} unit="" onCommit={(v) => setTuning((p) => ({ ...p, nebFloor: v }))} />
            <CommitSlider label="云对比" value={tuning.nebContrast} min={0.4} max={3.5} step={0.05} unit="" onCommit={(v) => setTuning((p) => ({ ...p, nebContrast: v }))} />
            <CommitSlider label="流速" value={tuning.flowSpeed} min={0} max={0.2} step={0.005} unit="" onCommit={(v) => setTuning((p) => ({ ...p, flowSpeed: v }))} />
            <CommitSlider label="星阈值" value={tuning.starThreshold} min={0.6} max={0.98} step={0.005} unit="" onCommit={(v) => setTuning((p) => ({ ...p, starThreshold: v }))} />
            <CommitSlider label="星亮度" value={tuning.starBright} min={0} max={2} step={0.05} unit="" onCommit={(v) => setTuning((p) => ({ ...p, starBright: v }))} />
            <CommitSlider label="边缘幂" value={tuning.rimPow} min={1} max={9} step={0.1} unit="" onCommit={(v) => setTuning((p) => ({ ...p, rimPow: v }))} />
            <CommitSlider label="边缘亮" value={tuning.rimBright} min={0} max={2.5} step={0.05} unit="" onCommit={(v) => setTuning((p) => ({ ...p, rimBright: v }))} />
            <CommitSlider label="暗环" value={tuning.darkRing} min={0} max={0.9} step={0.02} unit="" onCommit={(v) => setTuning((p) => ({ ...p, darkRing: v }))} />
            <CommitSlider label="焦散" value={tuning.caustic} min={0} max={0.8} step={0.02} unit="" onCommit={(v) => setTuning((p) => ({ ...p, caustic: v }))} />
            <CommitSlider label="高光" value={tuning.specBright} min={0} max={6} step={0.1} unit="" onCommit={(v) => setTuning((p) => ({ ...p, specBright: v }))} />
            <CommitSlider label="视差" value={tuning.parallaxAmt} min={0} max={0.35} step={0.01} unit="" onCommit={(v) => setTuning((p) => ({ ...p, parallaxAmt: v }))} />

            <CommitColorPicker label="云-淡" value={colors.lilac} onCommit={(v) => setColors((p) => ({ ...p, lilac: v }))} />
            <CommitColorPicker label="云-中" value={colors.violet} onCommit={(v) => setColors((p) => ({ ...p, violet: v }))} />
            <CommitColorPicker label="云-浓" value={colors.indigo} onCommit={(v) => setColors((p) => ({ ...p, indigo: v }))} />
            {/* 背景色：改的是外层 Hero 页面底色（连带球缘融入色），不是球
                内部的星云色，所以走 onBackgroundColorCommit 交给外层，
                不进本组件自己的 config/localStorage。 */}
            <CommitColorPicker
              label="背景色"
              value={pageColor}
              onCommit={(v) => onBackgroundColorCommit?.(v)}
            />

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  console.log(
                    "LiquidOrb tuning:\n" +
                      JSON.stringify({ tuning, colors, pageColor }, null, 2),
                  );
                }}
                className="flex-1 rounded-full border border-black/[0.08] px-2 py-1 text-[11px] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
              >
                打印当前数值
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfig({ tuning: ORB_DEFAULTS, colors: ORB_COLOR_DEFAULTS })
                }
                className="flex-1 rounded-full border border-black/[0.08] px-2 py-1 text-[11px] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
              >
                重置
              </button>
            </div>
          </div>
        </TuningPanelShell>
        </div>,
        document.body,
      )}
    </>
  );
}
