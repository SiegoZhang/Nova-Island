"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

import { getClampedDpr } from "@/lib/dotSystem/runtime";
import type { DeckTransitionState, MorphAnchorKey } from "@/components/SlideDeck";

// AI社群 → FDE 翻页时的「共享粒子形变层」：一整块常驻全屏 fixed 的
// THREE.Points，随 SlideDeck 写出的过渡进度 uT（0..1）把每颗粒子从「人形」
// （定格采样 navigator.mp4 一帧）插值到「球面」（程序化 Fibonacci 球），
// 中途收拢成一团抖动的密球。两端（uT≈0 / uT≈1）整层不可见，交给两屏各自
// 原本的点阵组件 + 文字（它们由 --ai-fde-t 驱动淡入淡出）。
//
// 只服务这一个交界；/ai、/fde 等页面不经过 SlideDeck，不会挂载这个组件。

const PARTICLE_COUNT = 14000;
// 人形定格采样网格（navigator.mp4 是 16:9），亮度过阈的格子才算「人身上的点」。
const SAMPLE_COLS = 168;
const SAMPLE_ROWS = 94;
const SAMPLE_LUMA_THRESHOLD = 0.17;
// 落点矩形半径 = 锚点元素 min(宽,高) 的这个倍数。人形锚区（渲染框）比人形
// 本体大不少，取小一点让形态贴近真正的 NavigatorDotMatrix；地球锚区约等于
// 地球本体。目视后可微调。
const ANCHOR_RADIUS_FRAC_A = 0.3;
const ANCHOR_RADIUS_FRAC_B = 0.42;

const VERTEX_SHADER = /* glsl */ `
  precision highp float;

  attribute vec2 aTargetA;   // 人形局部坐标（已按方形像素归一到 ~[-1,1]）
  attribute vec3 aRand;      // 每颗粒子固定随机数
  attribute float aBright;   // 人形阶段的采样亮度
  // position = aTargetB：Fibonacci 球面点（vec3）

  uniform float uT;
  uniform vec4 uRectA;       // 人形落点：ndc 中心 xy + 半宽半高
  uniform vec4 uRectB;       // 球体落点：同上
  uniform float uSphereSpin;
  uniform float uPixelRatio;

  varying float vMorphT;
  varying float vBright;
  varying float vRand;
  varying float vDepth;

  vec3 rotY(vec3 p, float a) {
    float s = sin(a);
    float c = cos(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    // 逐粒子相位：把 uT 前后微错开，粒子不齐步走 → 呼吸感
    float phase = (aRand.z - 0.5) * 0.16;
    float t = clamp(uT + phase, 0.0, 1.0);

    float morphT = smoothstep(0.16, 0.84, t);
    float gather = sin(clamp(t, 0.0, 1.0) * 3.14159265);

    vec3 sphere = rotY(normalize(position), uSphereSpin);
    vec2 formA = aTargetA;
    vec2 formB = sphere.xy;

    vec2 localBase = mix(formA, formB, morphT);
    vec2 ball = (aRand.xy - 0.5) * 0.5;
    vec2 local = mix(localBase, ball, gather * 0.9);

    vec4 rect = mix(uRectA, uRectB, morphT);
    vec2 ndc = rect.xy + local * rect.zw;

    gl_Position = vec4(ndc, 0.0, 1.0);

    float size = (0.55 + aRand.x * 0.9) * (1.0 + gather * 0.7);
    gl_PointSize = size * uPixelRatio * 1.7;

    vMorphT = morphT;
    vBright = aBright;
    vRand = aRand.y;
    vDepth = sphere.z;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying float vMorphT;
  varying float vBright;
  varying float vRand;
  varying float vDepth;

  uniform float uT;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float alpha = smoothstep(0.5, 0.14, d);
    if (alpha <= 0.0) discard;

    vec3 human = vec3(0.82, 0.83, 0.86) * (0.42 + vBright * 0.78);
    vec3 globe = vec3(0.36, 0.52, 0.85);
    vec3 col = mix(human, globe, vMorphT);

    // 球体阶段：背面的点压暗一点，做出体积感
    float depthDim = mix(1.0, 0.45 + 0.55 * smoothstep(-1.0, 0.4, vDepth), vMorphT);

    // 整层随过渡两端淡入淡出——静止停在任一屏时完全不可见
    float layer = smoothstep(0.03, 0.13, uT) * (1.0 - smoothstep(0.87, 0.97, uT));

    gl_FragColor = vec4(col * depthDim, alpha * layer * (0.7 + vRand * 0.3));
  }
`;

function once(el: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      el.removeEventListener(event, handler);
      resolve();
    };
    el.addEventListener(event, handler);
  });
}

interface HumanSample {
  targetA: Float32Array; // PARTICLE_COUNT * 2
  bright: Float32Array; // PARTICLE_COUNT
}

/** 定格 navigator.mp4 一帧，下采样成亮点集合，铺满 PARTICLE_COUNT 颗粒子。
 *  失败时抛错，调用方降级为「人形 = 球体拍平」。 */
async function sampleHumanFrame(src: string): Promise<HumanSample> {
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";

  await once(video, "loadeddata");
  const seekTo = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(1.6, video.duration * 0.4)
    : 1.2;
  video.currentTime = seekTo;
  await once(video, "seeked");

  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_COLS;
  canvas.height = SAMPLE_ROWS;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(video, 0, 0, SAMPLE_COLS, SAMPLE_ROWS);
  const { data } = ctx.getImageData(0, 0, SAMPLE_COLS, SAMPLE_ROWS);

  const videoAspect = (video.videoWidth || 16) / (video.videoHeight || 9);
  // 采到的亮点：先用「方形像素」局部坐标，之后按包围盒归一
  const pts: Array<{ x: number; y: number; b: number }> = [];
  for (let r = 0; r < SAMPLE_ROWS; r++) {
    for (let col = 0; col < SAMPLE_COLS; col++) {
      const i = (r * SAMPLE_COLS + col) * 4;
      const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      if (luma < SAMPLE_LUMA_THRESHOLD) continue;
      const u = (col + 0.5) / SAMPLE_COLS;
      const v = (r + 0.5) / SAMPLE_ROWS;
      pts.push({ x: (u - 0.5) * 2 * videoAspect, y: (0.5 - v) * 2, b: luma });
    }
  }
  if (pts.length < 32) throw new Error("frame too dark");

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2) || 1;

  const targetA = new Float32Array(PARTICLE_COUNT * 2);
  const bright = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const src = pts[i % pts.length];
    // 循环取样时加一点抖动，别让重复的点完全重叠
    const jx = (Math.random() - 0.5) * 0.04;
    const jy = (Math.random() - 0.5) * 0.04;
    targetA[i * 2] = (src.x - cx) / half + jx;
    targetA[i * 2 + 1] = (src.y - cy) / half + jy;
    bright[i] = src.b;
  }
  return { targetA, bright };
}

/** Fibonacci 球面：PARTICLE_COUNT 颗均匀分布的单位球面点。 */
function fibonacciSphere(): Float32Array {
  const out = new Float32Array(PARTICLE_COUNT * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out[i * 3] = Math.cos(theta) * radius;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(theta) * radius;
  }
  return out;
}

function anchorRect(
  el: HTMLElement | null,
  vw: number,
  vh: number,
  radiusFrac: number,
  // 把锚点屏幕 Y 加上这个「已滚过的像素」，得到该屏吸附时的定格位置——
  // 于是过渡期间粒子的两个端点都钉在屏幕上、不被滚动拽着走。
  shiftPx: number,
  fallback: THREE.Vector4,
): THREE.Vector4 {
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return fallback;
  const centerXNdc = ((r.left + r.width / 2) / vw) * 2 - 1;
  const centerYNdc = 1 - ((r.top + r.height / 2 + shiftPx) / vh) * 2;
  const radiusPx = radiusFrac * Math.min(r.width, r.height);
  return new THREE.Vector4(
    centerXNdc,
    centerYNdc,
    radiusPx / (vw / 2),
    radiusPx / (vh / 2),
  );
}

export function AiFdeParticleMorph({
  transitionRef,
  morphAnchorsRef,
}: {
  transitionRef: MutableRefObject<DeckTransitionState>;
  morphAnchorsRef: MutableRefObject<Record<MorphAnchorKey, HTMLElement | null>>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.Camera | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let disposed = false;
    let raf = 0;
    let displayT = 0;
    let wasVisible = false;

    const targetB = fibonacciSphere();
    // 先用「球体拍平」当人形兜底，采样成功后覆盖
    const targetA = new Float32Array(PARTICLE_COUNT * 2);
    const bright = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      targetA[i * 2] = targetB[i * 3] * 0.9;
      targetA[i * 2 + 1] = targetB[i * 3 + 1] * 0.9;
      bright[i] = 0.7;
    }
    const rand = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) rand[i] = Math.random();

    sampleHumanFrame("/videos/navigator.mp4")
      .then((s) => {
        if (disposed) return;
        targetA.set(s.targetA);
        bright.set(s.bright);
        const g = geometry;
        if (g) {
          (g.getAttribute("aTargetA") as THREE.BufferAttribute).needsUpdate = true;
          (g.getAttribute("aBright") as THREE.BufferAttribute).needsUpdate = true;
        }
      })
      .catch(() => {
        /* 兜底：人形 = 球体拍平，效果退化为交叉淡入淡出 + 收拢 */
      });

    function build() {
      renderer = new THREE.WebGLRenderer({ canvas: canvas!, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      const dpr = getClampedDpr();
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight, false);

      scene = new THREE.Scene();
      camera = new THREE.Camera(); // 顶点着色器直接输出 ndc，不需要投影

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(targetB, 3));
      geometry.setAttribute("aTargetA", new THREE.BufferAttribute(targetA, 2));
      geometry.setAttribute("aRand", new THREE.BufferAttribute(rand, 3));
      geometry.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));

      material = new THREE.ShaderMaterial({
        uniforms: {
          uT: { value: 0 },
          uRectA: { value: new THREE.Vector4(0, 0, 0.3, 0.4) },
          uRectB: { value: new THREE.Vector4(0, 0, 0.3, 0.4) },
          uSphereSpin: { value: 0 },
          uPixelRatio: { value: dpr },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false; // 顶点着色器直接写 gl_Position，包围盒无意义
      scene.add(points);
    }

    function onResize() {
      if (!renderer || !material) return;
      const dpr = getClampedDpr();
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      material.uniforms.uPixelRatio.value = dpr;
    }
    window.addEventListener("resize", onResize);

    const fallbackRect = new THREE.Vector4(0, 0, 0.28, 0.4);

    function tick() {
      raf = requestAnimationFrame(tick);

      const st = transitionRef.current;
      const target = st.t;
      displayT += (target - displayT) * 0.25;
      if (Math.abs(target - displayT) < 0.0015) displayT = target;

      const visible = displayT > 0.004 && displayT < 0.996;
      if (!visible) {
        if (wasVisible && renderer) renderer.clear();
        wasVisible = false;
        return;
      }
      wasVisible = true;

      if (!renderer) build();
      if (!renderer || !scene || !camera || !material) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      material.uniforms.uRectA.value = anchorRect(
        morphAnchorsRef.current.ai,
        vw,
        vh,
        ANCHOR_RADIUS_FRAC_A,
        st.aShiftPx,
        fallbackRect,
      );
      material.uniforms.uRectB.value = anchorRect(
        morphAnchorsRef.current.fde,
        vw,
        vh,
        ANCHOR_RADIUS_FRAC_B,
        st.bShiftPx,
        fallbackRect,
      );
      material.uniforms.uT.value = displayT;
      material.uniforms.uSphereSpin.value = displayT * 1.5;

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
    };
  }, [transitionRef, morphAnchorsRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 h-full w-full"
    />
  );
}
