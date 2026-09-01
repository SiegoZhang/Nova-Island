"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import { AiCommunityCarousel } from "@/components/AiCommunityCarousel";
import { ContactCtaSection } from "@/components/ContactCtaSection";
import { FdeSection } from "@/components/FdeSection";
import { TeamSection } from "@/components/TeamSection";
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
// 星空铺满整屏 → 然后一个一个「节点」浮现，每个节点一句短标题 + 一行说明，
// 侧边有分段进度轨告诉你在第几拍 → 最后收束、淡回浅色接章节。
//
// 一个 `h-[560vh]` 的 <section> 撑出滚动距离，内部 `sticky top-0 h-screen` 舞台
// 全程钉在视口。滚动进度 p(0..1) 命令式驱动（不进 React state）：
//   幕 1 · 进入   p 0→0.22   Hero 文案快速淡出；球轻微放大 + 玻璃溶解；浅色底
//                            淡出露深空；星空淡入 + 从放大「铺满」到位；眉标浮现
//   幕 2 · 节点   p 0.24→0.86 三个发光节点依次淡入淡出，每个一屏；进度轨
//   幕 3 · 收束   p 0.82→1    收尾句浮现，相机拉远，淡回浅色
//
// prefers-reduced-motion：直接停在「深空 + 整段文案」终态，无动画。

const navLinks = [
  { label: "首页", href: "/", active: true },
  { label: "AI社群", href: "/ai" },
  { label: "FDE", href: "/fde" },
  { label: "活动", href: "/community/events" },
  { label: "社区", href: "/community" },
  { label: "联系我们", href: "/contact" },
];

// 进入水晶球之后，把**方案 A 里现成的板块组件**（AI社群 / FDE / 团队 / 联系我们）
// 各包一张近全屏卡片，随滚轮一页一页翻——组件本身不改。
const CARDS: { label: string; node: ReactNode }[] = [
  { label: "AI社群", node: <AiCommunityCarousel /> },
  { label: "FDE", node: <FdeSection /> },
  { label: "团队", node: <TeamSection /> },
  { label: "联系我们", node: <ContactCtaSection /> },
];

// 每张卡片的 [淡入起, 淡入止, 淡出起, 淡出止]（p 值）。进入转场 ~p0.34 球淡尽，
// 之后 4 张卡均分 0.40→1.0；最后一张不淡出、留到底。
const CARD_WINDOWS: [number, number, number, number][] = [
  [0.39, 0.46, 0.52, 0.58],
  [0.55, 0.61, 0.67, 0.73],
  [0.7, 0.76, 0.82, 0.88],
  [0.85, 0.91, 1.6, 1.7],
];

const PARAGRAPH =
  "新岛专注于人工智能领域的知识服务与工程落地，业务由 AI 社群与 FDE 两大模块构成。我们以「认知—落地」为主线，前者面向个人与团队，持续沉淀前沿动态与实践方法；后者面向企业客户，提供深度定制的 AI 工程化交付，推动技术在真实业务场景中产生价值。";

const PAGE_LIGHT = "#f5f6f7";

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
    float tw = 0.5 + 0.5 * sin(uTime * 1.5 + aSeed * 6.2831);
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
    let x: number, y: number, z: number;
    const band = Math.random();
    if (band < 0.5) {
      x = (Math.random() - 0.5) * 48;
      y = (Math.random() - 0.5) * 32;
      z = -80 + Math.random() * 96;
    } else {
      const t = Math.random();
      const cx = band < 0.75 ? -7 : 9;
      const cy = band < 0.75 ? 5 : -6;
      x = cx + (t - 0.5) * 42 + (Math.random() - 0.5) * 10;
      y = cy + (t - 0.5) * 12 + (Math.random() - 0.5) * 8;
      z = -80 + Math.random() * 96;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const r = Math.random();
    size[i] = r < 0.9 ? 0.5 + Math.random() * 1.7 : 2.8 + Math.random() * 3.6;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  return geo;
}

// 把方案 A 的一个板块组件包成星空里的一张近全屏卡片。组件本身不改。
//   · outer：绝对定位 + pointerEvents 开关（applyDom 按帧写）
//   · inner：opacity / translateY 动画
//   · frame：圆角描边深色面板，overflow-hidden；里面的 section 用 arbitrary
//     variant 把 `min-h-[100svh]` / `h-[100svh]` 压成 100%，section 内容自适应卡高
//   · mounted 为 false 时不渲染 section（省 WebGL / 视频解码上下文）
function TransitionCard({
  node,
  mounted,
}: {
  node: ReactNode;
  mounted: boolean;
}) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[90svh] w-[min(1320px,93vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="h-full opacity-0" style={{ willChange: "opacity, transform" }}>
        {/* 卡片外壳：深色圆角描边面板，浮在星空上。里面塞方案 A 的现成 <section>，
            用 child-combinator 把 section 内那层 `min-h-[100svh]/h-[100svh]` 压成
            卡片高度，让板块内容自适应卡片、不溢出被裁。 */}
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[26px] border border-white/12 bg-[#08080d] shadow-[0_0_150px_-10px_rgba(0,0,0,0.92)] [&>section>div]:!min-h-0 [&>section>div]:!h-full [&>section]:h-full [&>section]:w-full">
          {mounted ? node : null}
        </div>
      </div>
    </div>
  );
}

export function UniverseTransition() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const lightRef = useRef<HTMLDivElement | null>(null);
  const terrainRef = useRef<HTMLDivElement | null>(null);
  const orbWrapRef = useRef<HTMLDivElement | null>(null);
  const starWrapRef = useRef<HTMLDivElement | null>(null);
  const nebulaRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const eyebrowRef = useRef<HTMLDivElement | null>(null);
  const cardsWrapRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const railLabelRef = useRef<HTMLSpanElement | null>(null);
  const staticRef = useRef<HTMLDivElement | null>(null);

  const progressRef = useRef(0);
  const dissolveRef = useRef(0); // 传给 LiquidOrb，按帧读取

  // ── 挂载门控 ─────────────────────────────────────────────────
  // 方案 A 的板块组件每个都带 WebGL / 视频点阵，4 个一起挂载会有太多上下文。
  // 只在滚动进度靠近某张卡时才挂载它，离开就卸载。进入阶段的球 / 地形同理。
  const [mountedCards, setMountedCards] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [entryMounted, setEntryMounted] = useState(true); // 球 + 底部地形
  const mountStateRef = useRef({
    cards: [false, false, false, false],
    entry: true,
  });

  useEffect(() => {
    const section = sectionRef.current;
    const starWrap = starWrapRef.current;
    if (!section || !starWrap) return;

    const reduce = prefersReducedMotion();

    // ── 星场场景 ──────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 260);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 不透明深空底（比纯黑提亮一点，孔沿的深空底不至于像一圈死黑）
    renderer.setClearColor(0x171326, 1);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    starWrap.appendChild(renderer.domElement);

    const starCount = window.innerWidth < 720 ? 1500 : 2800;
    const geo = buildStarField(starCount);
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColorDim: { value: hexV3("#6f53a6") },
      uColorHot: { value: hexV3("#efe6ff") },
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

    let vw = 0;
    let vh = 0;
    function resize() {
      const w = starWrap!.clientWidth;
      const h = starWrap!.clientHeight;
      if (w === vw && h === vh) return;
      vw = w;
      vh = h;
      const dpr = Math.min(1.75, getClampedDpr());
      uniforms.uPixelRatio.value = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    resize();

    // ── 滚动进度 → DOM ───────────────────────────────────────
    let ticking = false;
    // 只在进度跨过挂载边界时才 setState（低频，不影响每帧命令式写 DOM）
    function syncMountState(p: number) {
      const cards = CARD_WINDOWS.map((w) => {
        const lo = w[0] - 0.08;
        const hi = w[3] > 1 ? 3 : w[3] + 0.14;
        return p > lo && p < hi;
      });
      const entry = p < 0.5;
      const s = mountStateRef.current;
      if (entry !== s.entry || cards.some((v, i) => v !== s.cards[i])) {
        mountStateRef.current = { cards, entry };
        setMountedCards(cards);
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
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(readProgress);
      }
    }

    function applyDom(p: number) {
      // ── 幕 1 · 进入 ──────────────────────────────────────
      // Hero 文案：滚轮一动就快速淡出
      if (heroRef.current) {
        const o = 1 - smoothstep(0.004, 0.055, p);
        heroRef.current.style.opacity = o.toFixed(3);
        const s = 1 + smoothstep(0, 0.3, p) * 0.06;
        heroRef.current.style.transform = `scale(${s.toFixed(4)})`;
      }
      if (terrainRef.current) {
        terrainRef.current.style.opacity = (
          1 - smoothstep(0.006, 0.085, p)
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
      const scale = lerp(1, targetScale, smoothstep(0, 0.3, p));
      const diss = clamp01(
        smoothstep(0.02, 0.055, p) * 0.08 + // 起步一小跳
          smoothstep(0.03, 0.24, p) * 0.42 + // 增长期封顶 ~0.5（eat≈0.68，玻璃壳留 0.68→1）
          smoothstep(0.24, 0.34, p) * 0.5, // 铺满后补到 1.0
      );
      dissolveRef.current = diss;
      if (orbWrap) {
        orbWrap.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        orbWrap.style.opacity = (1 - smoothstep(0.32, 0.42, p)).toFixed(3);
        orbWrap.style.pointerEvents = p > 0.05 ? "none" : "auto";
      }
      // 真 3D 星场 canvas 的圆形 clip：中心对齐球心，半径跟着溶解孔（比孔大一圈，
      // 差值藏进不透明玻璃壳里）。球放大 → circleR 变大 → clip 最终铺满整屏。
      const tail = 1 - smoothstep(0.965, 1.0, p);
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
      starWrap!.style.opacity = (smoothstep(0.008, 0.04, p) * tail).toFixed(3);
      starWrap!.style.setProperty("clip-path", clip);
      starWrap!.style.setProperty("-webkit-clip-path", clip);
      if (nebulaRef.current) {
        nebulaRef.current.style.opacity = (
          smoothstep(0.008, 0.045, p) * tail
        ).toFixed(3);
        nebulaRef.current.style.setProperty("clip-path", clip);
        nebulaRef.current.style.setProperty("-webkit-clip-path", clip);
      }
      // 浅色底：clip 铺满后被真星场盖住；安全淡出 + 末尾淡回交章节。
      if (lightRef.current) {
        const lightOut = 1 - smoothstep(0.32, 0.44, p);
        const lightBack = smoothstep(0.965, 1.0, p);
        lightRef.current.style.opacity = Math.max(lightOut, lightBack).toFixed(3);
      }
      // 穿壳微光：球膨胀铺满那一下，一次柔和呼吸光
      if (flashRef.current) {
        const f = smoothstep(0.2, 0.27, p) * (1 - smoothstep(0.27, 0.37, p));
        flashRef.current.style.opacity = (f * 0.22).toFixed(3);
      }
      // 第一句话「你好，欢迎进入新岛」：溶解进行中浮现，卡片出现前淡出
      if (eyebrowRef.current) {
        const v = smoothstep(0.09, 0.15, p) * (1 - smoothstep(0.3, 0.38, p));
        eyebrowRef.current.style.opacity = v.toFixed(3);
        eyebrowRef.current.style.transform = `translate(-50%, ${lerp(14, 0, smoothstep(0.09, 0.16, p)).toFixed(1)}px)`;
      }

      // ── 幕 2 · 方案 A 板块内容卡片，一张一页随滚轮翻 ──────
      if (cardsWrapRef.current) {
        for (let i = 0; i < CARDS.length; i++) {
          const outer = cardsWrapRef.current.children[i] as HTMLElement;
          const inner = outer.firstElementChild as HTMLElement;
          const w = CARD_WINDOWS[i];
          const enter = smoothstep(w[0], w[1], p);
          const exit = smoothstep(w[2], w[3], p);
          const v = enter * (1 - exit);
          inner.style.opacity = v.toFixed(3);
          // 近全屏卡片：进入从下方 26px 微微上移到位 + 轻微放大；离开继续上移淡出
          const ty = lerp(26, 0, enter) - exit * 20;
          const sc = lerp(0.985, 1, enter);
          inner.style.transform = `translateY(${ty.toFixed(1)}px) scale(${sc.toFixed(4)})`;
          outer.style.pointerEvents = v > 0.6 ? "auto" : "none";
        }
      }
      // 分段进度轨（4 段，对应 4 张卡）
      if (railRef.current) {
        const railV =
          smoothstep(0.37, 0.43, p) * (1 - smoothstep(0.985, 1.0, p));
        railRef.current.style.opacity = railV.toFixed(3);
        const ai = p < 0.55 ? 0 : p < 0.7 ? 1 : p < 0.855 ? 2 : 3;
        for (let i = 0; i < 4; i++) {
          const seg = railRef.current.children[i] as HTMLElement;
          seg.style.width = i === ai ? "28px" : "12px";
          seg.style.background =
            i <= ai ? "rgba(240,230,255,0.9)" : "rgba(255,255,255,0.16)";
        }
        if (railLabelRef.current)
          railLabelRef.current.textContent = `0${ai + 1} / 04`;
      }
    }

    // ── 渲染循环 ─────────────────────────────────────────────
    let raf = 0;
    let running = false;
    const clock = new THREE.Clock();

    function frame() {
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
      if (running) return;
      running = true;
      clock.start();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(starWrap);
    window.addEventListener("scroll", onScroll, { passive: true });
    readProgress();

    let dispose = () => {};
    if (reduce) {
      if (heroRef.current) heroRef.current.style.opacity = "0";
      if (lightRef.current) lightRef.current.style.opacity = "0";
      if (terrainRef.current) terrainRef.current.style.opacity = "0";
      if (orbWrapRef.current) orbWrapRef.current.style.opacity = "0";
      dissolveRef.current = 1;
      starWrap.style.opacity = "1";
      starWrap.style.removeProperty("clip-path");
      starWrap.style.removeProperty("-webkit-clip-path");
      if (nebulaRef.current) {
        nebulaRef.current.style.opacity = "0.9";
        nebulaRef.current.style.removeProperty("clip-path");
      }
      if (staticRef.current) staticRef.current.style.opacity = "1";
      uniforms.uTime.value = 6;
      renderer.render(scene, camera);
    } else {
      dispose = createVisibilityLifecycle(section, {
        onVisible: start,
        onHidden: stop,
      });
    }

    return () => {
      stop();
      dispose();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === starWrap) {
        starWrap.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative h-[680vh] bg-[#080611]"
      aria-label="新岛 · 进入"
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* ── 最底：深空兜底色 ── */}
        <div className="absolute inset-0" style={{ background: "#080611" }} />

        {/* ── 浅色底（Hero/页面底色）：**开场满、全程不变**，直到球放大盖住
             整屏才淡出。在真星场下面。 ── */}
        <div
          ref={lightRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: PAGE_LIGHT, willChange: "opacity" }}
        />

        {/* Hero 底部的低对比度 3D 点阵地形：只在开场存在，进入球体时淡出。 */}
        <div
          ref={terrainRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(210px,28svh,360px)] opacity-100"
          style={{ willChange: "opacity" }}
        >
          {entryMounted && <HeroParticleTerrain className="size-full" />}
        </div>

        {/* ── 真 3D 星场（全屏满分辨率、不缩放）：用圆形 clip-path 跟着
             溶解孔长大，只在溶解处可见；圆外仍是浅底。 ── */}
        <div
          ref={starWrapRef}
          aria-hidden
          className="absolute inset-0 opacity-0"
          style={{ willChange: "opacity, clip-path" }}
        />

        {/* ── 星云辉光（叠在星场上）。跟 clip 同心的一大团中央辉光，保证不管
             溶解孔多大、孔沿都不会是一圈死黑的深空底。 ── */}
        <div
          ref={nebulaRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{ willChange: "opacity" }}
        >
          <div
            className="absolute left-1/2 top-[31%] h-[240vmax] w-[240vmax] -translate-x-1/2 -translate-y-1/2 lg:left-1/2 lg:top-[49.5%]"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(92,64,140,0.42), rgba(78,54,120,0.34) 26%, rgba(64,44,100,0.26) 48%, rgba(50,35,82,0.18) 66%, rgba(38,27,64,0.1) 82%, transparent 96%)",
              filter: "blur(70px)",
            }}
          />
          <div
            className="absolute left-[14%] top-[14%] h-[80vh] w-[64vw]"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(150,97,209,0.3), transparent 70%)",
              filter: "blur(54px)",
            }}
          />
          <div
            className="absolute right-[6%] bottom-[8%] h-[72vh] w-[56vw]"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(210,186,240,0.2), transparent 68%)",
              filter: "blur(58px)",
            }}
          />
        </div>

        {/* ── 水晶球：Hero 原位，滚动放大穿过 ── */}
        <div
          ref={orbWrapRef}
          className="absolute left-1/2 top-[31%] h-[min(80vw,360px)] w-[min(80vw,360px)] lg:left-1/2 lg:top-[49.5%] lg:h-[clamp(430px,62svh,1080px)] lg:w-[clamp(430px,62svh,1080px)]"
          style={{
            transform: "translate(-50%, -50%) scale(1)",
            willChange: "transform, opacity",
          }}
        >
          <div className="absolute inset-[-18%]">
            {entryMounted && (
              <LiquidOrb
                className="h-full w-full"
                pageColor={PAGE_LIGHT}
                debug={false}
                dissolveRef={dissolveRef}
              />
            )}
          </div>
        </div>

        {/* ── Hero 文案（左侧主叙事 + 右侧数据）──
             整层 pointer-events-none，否则这块 absolute inset-0 的浮层会盖在
             球上、把 pointermove 全吃掉 → 球失去鼠标视差。导航单独一层、不淡出。 */}
        <div
          ref={heroRef}
          className="pointer-events-none absolute inset-0 text-[#171717]"
          style={{ willChange: "opacity, transform", transformOrigin: "50% 52%" }}
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
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-[#151719] px-5 py-2 text-[12px] font-medium text-white transition-[background-color,transform] hover:bg-black active:scale-[0.97]"
              >
                加入岛屿 <span aria-hidden>↗</span>
              </Link>
              <Link
                href="#about"
                className="inline-flex items-center gap-2 px-1 text-[12px] font-medium text-[#222] transition-[opacity,transform] hover:opacity-60 active:scale-[0.97] lg:hidden"
              >
                了解更多 <span aria-hidden>›</span>
              </Link>
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
        </div>

        {/* ── 悬浮胶囊导航：玻璃质感、无阴影、贴顶、占比小；全程不淡出 ── */}
        <nav
          ref={navRef}
          className="pointer-events-auto absolute left-1/2 top-2 z-[60] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/50 bg-white/60 py-1.5 pr-1.5 pl-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55)] backdrop-blur-2xl sm:top-3"
        >
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap pr-2 pl-1 text-[13px] font-bold tracking-tight text-[#111]"
          >
            NOVA Island
          </Link>
          {navLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] transition-colors ${
                l.active
                  ? "font-semibold text-[#111]"
                  : "hidden text-black/55 hover:text-[#111] md:block"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="hidden shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] text-black/55 transition-colors hover:text-[#111] sm:block"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="ml-1 shrink-0 whitespace-nowrap rounded-full bg-[#111] px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-black"
          >
            加入岛屿
          </Link>
        </nav>

        {/* ── 穿壳微光（柔和一闪） ── */}
        <div
          ref={flashRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{
            background:
              "radial-gradient(circle at 50% 48%, rgba(245,239,255,0.98), rgba(214,194,242,0.8) 42%, rgba(178,148,224,0.55) 78%), rgba(150,120,205,0.5)",
            willChange: "opacity",
          }}
        />

        {/* ── 进入水晶球时浮现的第一句话 ── */}
        <div
          ref={eyebrowRef}
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(460px,86vw)] text-center opacity-0"
          style={{ transform: "translate(-50%, 0)", willChange: "opacity, transform" }}
        >
          <span
            className="block text-[clamp(1.15rem,2.6vw,1.6rem)] font-medium leading-[1.4] tracking-[-0.01em] text-white/90"
            style={{ textShadow: "0 1px 18px rgba(8,6,17,0.9)" }}
          >
            你好，欢迎进入新岛
          </span>
        </div>

        {/* ── 幕 2 · 方案 A 现成板块组件，各包一张近全屏卡片，随滚轮翻页 ── */}
        <div ref={cardsWrapRef} className="pointer-events-none absolute inset-0 z-20">
          {CARDS.map((card, i) => (
            <TransitionCard
              key={card.label}
              node={card.node}
              mounted={mountedCards[i]}
            />
          ))}
        </div>

        {/* ── 分段进度轨（4 段）── */}
        <div
          ref={railRef}
          aria-hidden
          className="pointer-events-none absolute bottom-[2.2vh] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 opacity-0"
          style={{ willChange: "opacity" }}
        >
          <span className="h-[2px] w-3 rounded-full bg-white/16 transition-all duration-300" />
          <span className="h-[2px] w-3 rounded-full bg-white/16 transition-all duration-300" />
          <span className="h-[2px] w-3 rounded-full bg-white/16 transition-all duration-300" />
          <span className="h-[2px] w-3 rounded-full bg-white/16 transition-all duration-300" />
          <span
            ref={railLabelRef}
            className="ml-3 text-[10px] font-medium uppercase tracking-[0.28em] text-white/45"
          >
            01 / 04
          </span>
        </div>

        {/* ── reduced-motion 静态兜底：深空 + 整段文案 ── */}
        <div
          ref={staticRef}
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(720px,88vw)] -translate-x-1/2 -translate-y-1/2 px-2 text-center opacity-0"
        >
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -z-10 h-[150%] w-[130%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, rgba(8,6,17,0.75), rgba(8,6,17,0.4) 55%, transparent 78%)",
            }}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-[#a98fe0]">
            新岛 · NOVAISLAND
          </p>
          <p
            className="mt-7 text-[15px] leading-[2.05] tracking-[0.02em] text-white/85 md:text-[16px]"
            style={{ textShadow: "0 1px 18px rgba(8,6,17,0.9)" }}
          >
            {PARAGRAPH}
          </p>
        </div>
      </div>
    </section>
  );
}
