"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { HeroCtas } from "@/components/HeroCtas";
import {
  CommitSlider,
  TuningPanelShell,
} from "@/components/dotSystemTuningControls";
import { createVisibilityLifecycle, prefersReducedMotion } from "@/lib/dotSystem/runtime";
import { useHeroTheme } from "@/lib/heroTheme";

// ─────────────────────────────────────────────────────────────────────────────
// 【已封存 · 方案 A 的 Hero】
//
// 这是原「方案 A · 整屏幻灯片」首页的 Hero：一整块「流动等高线」GLSL 背景
// （HeroFlowField）+ 居中的浅色文案 + CTA。方案 A 整体已从代码里删除，
// 这个 Hero 效果单独留在这里，之后如果要复用直接从这里取。
//
// 当前没有任何地方渲染它。要用的话：
//   import { PlanAHeroSection } from "@/components/home-variants/preserved/PlanAHeroFlowField";
// 依赖（都还在仓库里）：HeroCtas / useHeroTheme / dotSystemTuningControls /
// dotSystem/runtime / three。
//
// 原文件：components/HeroFlowField.tsx + components/HeroSection.tsx（已删除，合并到此）
// ─────────────────────────────────────────────────────────────────────────────

// ── HeroFlowField：Hero 背景「流动等高线」──────────────────────────────────
// 参照 CCT "Universes" LED 幕墙的观感——不是位移的平行线网格，而是一个二维
// 标量场被反复自我扭曲（IQ 的 domain warping）后抽出的等值线，线随时间缓慢
// 流动、morph，黑底叠加发光。
//
// 一个 <canvas> + 单个全屏三角形 + ShaderMaterial，美术全在片元着色器里。
// 没有 React state 驱动重绘，挂载后在一个 useEffect 里手写 resize / rAF 循环，
// 复用 dotSystem/runtime 里的可见性生命周期与「减少动效」判断。
//
// 性能：fbm 每像素约 5 次调用 × 4 个倍频，对集显偏重——渲染缓冲按 QUALITY
// 系数降采样并夹住 DPR；prefers-reduced-motion 下只画一帧、不起 rAF。

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uWarp;       // 域扭曲强度：越大，漩涡/指纹纹路越狂野
  uniform float uLineFreq;   // 等高线密度
  uniform float uFlow;       // 流动速度
  uniform float uLineWidth;  // 线宽（相对本地梯度）
  uniform float uGlow;       // 辉光扩散

  uniform vec3 uBgTop;
  uniform vec3 uBgBottom;
  uniform vec3 uC0;  // 深靛蓝
  uniform vec3 uC1;  // 板岩蓝
  uniform vec3 uC2;  // 浅长春花蓝
  uniform vec3 uC3;  // 冷调冰白

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = m * p;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y) * 2.6;

    float t = uTime * uFlow;

    // 迭代域扭曲：坐标反复用自身的 fbm 结果去偏移，时间只喂进内层。
    vec2 q = vec2(
      fbm(p + vec2(0.0, 0.0)),
      fbm(p + vec2(5.2, 1.3))
    );
    vec2 r = vec2(
      fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.12 * t),
      fbm(p + uWarp * q + vec2(8.3, 2.8) + 0.10 * t)
    );
    float h = fbm(p + uWarp * r);

    // 抽等高线：fwidth 归一化让线宽在屏幕空间恒定，不随场的陡缓变化。
    float lines = h * uLineFreq;
    float g = abs(fract(lines) - 0.5);
    float aa = max(fwidth(lines), 1e-4);
    float line = 1.0 - smoothstep(uLineWidth * aa, (uLineWidth + 1.6) * aa, g);
    float glow = pow(1.0 - smoothstep(0.0, uGlow, g), 2.0);

    // 按场值上色：深靛蓝 → 板岩蓝 → 长春花蓝 → 冰白。
    float shade = clamp(h * 0.5 + 0.5, 0.0, 1.0);
    vec3 lineCol = mix(uC0, uC1, smoothstep(0.0, 0.45, shade));
    lineCol = mix(lineCol, uC2, smoothstep(0.4, 0.72, shade));
    lineCol = mix(lineCol, uC3, smoothstep(0.72, 1.0, shade));

    // 背景竖向渐变 + 极轻的场着色。
    vec3 bg = mix(uBgBottom, uBgTop, pow(uv.y, 1.2));
    bg += 0.035 * uC1 * shade;

    vec3 col = bg;
    col += lineCol * glow * 0.5;
    col = mix(col, lineCol, line * 0.92);

    // 暗角
    float vig = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(aspect, 1.0)));
    col *= mix(0.68, 1.0, vig);

    // 细颗粒，压掉大面积平滑渐变的色带
    col += (noise(uv * uResolution.xy * 0.35) * 0.012);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// 渲染缓冲降采样系数：画面是柔的，0.8× 缓冲 CSS 放大后基本无损。
const QUALITY = 0.8;

function hex(value: string): THREE.Color {
  return new THREE.Color(value);
}

const PALETTE = {
  bgTop: "#0a1330",
  bgBottom: "#020306",
  c0: "#1b2245",
  c1: "#3d4784",
  c2: "#7e8ec8",
  c3: "#dfe6f5",
} as const;

const FLOW_FIELD_DEFAULTS = {
  warp: 4.0,
  lineFreq: 11,
  flow: 1.0,
  lineWidth: 0.9,
  glow: 0.22,
};

type FlowFieldTuning = typeof FLOW_FIELD_DEFAULTS;

const DEV_TUNING_ENABLED = process.env.NODE_ENV !== "production";
const STORAGE_KEY = "novaisland:hero-flowfield:v1";

function loadTuning(): FlowFieldTuning {
  if (!DEV_TUNING_ENABLED || typeof window === "undefined") return FLOW_FIELD_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return FLOW_FIELD_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<FlowFieldTuning>;
    return { ...FLOW_FIELD_DEFAULTS, ...parsed };
  } catch {
    return FLOW_FIELD_DEFAULTS;
  }
}

export function PlanAHeroFlowField() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const renderOnceRef = useRef<(() => void) | null>(null);

  const [tuning, setTuning] = useState<FlowFieldTuning>(FLOW_FIELD_DEFAULTS);

  useEffect(() => {
    if (!DEV_TUNING_ENABLED) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTuning(loadTuning());
  }, []);

  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (!DEV_TUNING_ENABLED || typeof window === "undefined") return;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
    } catch {
      // 隐私模式/配额禁用：忽略。
    }
  }, [tuning]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    u.uWarp.value = tuning.warp;
    u.uLineFreq.value = tuning.lineFreq;
    u.uFlow.value = tuning.flow;
    u.uLineWidth.value = tuning.lineWidth;
    u.uGlow.value = tuning.glow;
    renderOnceRef.current?.();
  }, [tuning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = prefersReducedMotion();

    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uWarp: { value: FLOW_FIELD_DEFAULTS.warp },
      uLineFreq: { value: FLOW_FIELD_DEFAULTS.lineFreq },
      uFlow: { value: FLOW_FIELD_DEFAULTS.flow },
      uLineWidth: { value: FLOW_FIELD_DEFAULTS.lineWidth },
      uGlow: { value: FLOW_FIELD_DEFAULTS.glow },
      uBgTop: { value: hex(PALETTE.bgTop) },
      uBgBottom: { value: hex(PALETTE.bgBottom) },
      uC0: { value: hex(PALETTE.c0) },
      uC1: { value: hex(PALETTE.c1) },
      uC2: { value: hex(PALETTE.c2) },
      uC3: { value: hex(PALETTE.c3) },
    };
    uniformsRef.current = uniforms;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // 全屏三角形——比铺满的四边形少一次对角线上的过绘制。
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;

    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.Camera();

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setClearColor(hex(PALETTE.bgBottom), 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    let raf = 0;
    let running = false;
    let isVisible = true;
    const startTime = performance.now();

    function resize() {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      const pr = Math.min(1.5, window.devicePixelRatio || 1) * QUALITY;
      renderer.setPixelRatio(pr);
      renderer.setSize(width, height, false);
      (uniforms.uResolution.value as THREE.Vector2).set(width * pr, height * pr);
      renderOnce();
    }

    function renderOnce() {
      renderer.render(scene, camera);
    }
    renderOnceRef.current = renderOnce;

    function frame() {
      uniforms.uTime.value = (performance.now() - startTime) / 1000;
      renderOnce();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduceMotion || !isVisible || running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);

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
      uniformsRef.current = null;
      renderOnceRef.current = null;
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        aria-hidden="true"
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
      />
      {DEV_TUNING_ENABLED && (
        <TuningPanelShell
          title="Hero 流场调参（仅开发环境可见）"
          widthClassName="w-[260px]"
          positionClassName="right-4 bottom-4"
        >
          <div className="flex flex-col gap-2">
            <CommitSlider
              label="扭曲"
              value={tuning.warp}
              min={0}
              max={8}
              step={0.1}
              unit=""
              onCommit={(warp) => setTuning((prev) => ({ ...prev, warp }))}
            />
            <CommitSlider
              label="线密度"
              value={tuning.lineFreq}
              min={3}
              max={28}
              step={1}
              unit=""
              onCommit={(lineFreq) => setTuning((prev) => ({ ...prev, lineFreq }))}
            />
            <CommitSlider
              label="流速"
              value={tuning.flow}
              min={0}
              max={3}
              step={0.05}
              unit="×"
              onCommit={(flow) => setTuning((prev) => ({ ...prev, flow }))}
            />
            <CommitSlider
              label="线宽"
              value={tuning.lineWidth}
              min={0.3}
              max={2.5}
              step={0.05}
              unit=""
              onCommit={(lineWidth) => setTuning((prev) => ({ ...prev, lineWidth }))}
            />
            <CommitSlider
              label="辉光"
              value={tuning.glow}
              min={0}
              max={0.5}
              step={0.01}
              unit=""
              onCommit={(glow) => setTuning((prev) => ({ ...prev, glow }))}
            />
          </div>
        </TuningPanelShell>
      )}
    </>
  );
}

// ── PlanAHeroSection：整块 Hero（流场背景 + 居中文案 + CTA）───────────────
// 背景是深色，hero 非浅底、隐藏网格竖线（挂载时通知一次 heroTheme）。
// 文案整套浅色系，CTA 走 light={false}（白色系按钮）。

const HERO_ENTRANCE_DURATION_MS = 700;

export function PlanAHeroSection() {
  const { setIsHeroLight, setHideHeroRails } = useHeroTheme();

  useEffect(() => {
    setIsHeroLight(true);
    setHideHeroRails(true);
  }, [setIsHeroLight, setHideHeroRails]);

  return (
    <section id="hero" className="relative h-[100svh] w-full">
      <div className="relative flex h-full w-full items-start justify-center overflow-hidden bg-black">
        <PlanAHeroFlowField />

        <div
          data-parallax
          className="relative flex flex-col items-center px-6 pt-[24vh] text-center"
        >
          <div className="flex flex-col items-center">
            <p
              className="reveal text-[15px] font-medium text-white/55"
              style={{ animationDuration: `${HERO_ENTRANCE_DURATION_MS}ms` }}
            >
              让 AI 从认知走向价值
            </p>

            <h1
              className="reveal mt-5 bg-gradient-to-r from-[#d9d9d9] to-white bg-clip-text text-[clamp(56px,11vw,84px)] font-semibold leading-[1.05] tracking-[-0.03em] text-transparent"
              style={{ animationDuration: `${HERO_ENTRANCE_DURATION_MS}ms` }}
            >
              新岛
            </h1>

            <p
              className="reveal mt-8 max-w-[600px] text-[18px] leading-[1.6] text-white/75"
              style={{ animationDuration: `${HERO_ENTRANCE_DURATION_MS}ms` }}
            >
              专注于人工智能领域的知识服务与工程落地，以AI社群保持认知领先，以FDE驱动工程落地。
            </p>

            <HeroCtas
              light={false}
              revealDurationMs={HERO_ENTRANCE_DURATION_MS}
              revealDelayMs={0}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
