"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";

import {
  CommitSlider,
  TuningPanelShell,
  TuningSlider,
} from "@/components/dotSystemTuningControls";
import {
  createVisibilityLifecycle,
  getClampedDpr,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

type TerrainTuning = {
  density: number;
  dotSize: number;
  brightness: number;
  waveAmplitude: number;
  speed: number;
  terrainHeight: number;
  shadowStrength: number;
  pointerLift: number;
};

const TERRAIN_DEFAULTS: TerrainTuning = {
  density: 100,
  dotSize: 100,
  brightness: 100,
  waveAmplitude: 100,
  speed: 100,
  terrainHeight: 100,
  shadowStrength: 100,
  pointerLift: 100,
};

const DEV_TUNING_ENABLED = process.env.NODE_ENV !== "production";
const TERRAIN_STORAGE_KEY = "novaisland:hero-particle-terrain:v3";

function loadStoredTuning() {
  if (!DEV_TUNING_ENABLED || typeof window === "undefined") {
    return TERRAIN_DEFAULTS;
  }
  try {
    const raw = window.localStorage.getItem(TERRAIN_STORAGE_KEY);
    if (!raw) return TERRAIN_DEFAULTS;
    return { ...TERRAIN_DEFAULTS, ...(JSON.parse(raw) as Partial<TerrainTuning>) };
  } catch {
    return TERRAIN_DEFAULTS;
  }
}

const TERRAIN_VERT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uFieldWidth;
  uniform float uDotSize;
  uniform float uWaveAmplitude;
  uniform float uSpeed;
  uniform float uTerrainHeight;
  uniform vec2  uPointer;         // 指针在地面(y=0)的投影 (worldX, worldZ)
  uniform float uPointerStrength; // 0→1，进入/离开时平滑渐变
  uniform float uPointerLift;     // 调参：涟漪强度

  attribute float aRnd;           // 每点固定随机数 0..1，用于密度剔除 / 抖动

  varying float vAlpha;
  varying float vRidge;
  varying float vRipple;

  // 指针涟漪：以指针投影为中心的高斯隆起 + 一圈随时间外扩的行波
  float pointerRipple(vec2 fieldPos, float t, out float bumpOut) {
    vec2 delta = fieldPos - uPointer;
    float dist = length(delta);
    float r2 = 15.0;
    float bump = exp(-(dist * dist) / r2);
    float ring = sin(dist * 1.4 - t * 4.5) * exp(-(dist * dist) / (r2 * 2.6));
    bumpOut = bump * uPointerStrength;
    return (bump * 0.62 + ring * 0.4) * uPointerStrength * uPointerLift;
  }

  void main() {
    float x = position.x * uFieldWidth;
    float z = position.z * 10.5 - 3.0;
    float animTime = uTime * uSpeed;

    // 只叠加低频正弦：宽、缓、无尖峰的数据地形。单层。
    float wave =
      sin(x * 0.38 + animTime * 0.24) * 0.48 +
      sin(z * 0.48 - animTime * 0.19) * 0.34 +
      sin((x + z) * 0.21 + animTime * 0.13) * 0.24;

    // 地形自由起伏：水晶球正下方不再压平波形。
    float moundX = x * 0.17;
    float moundZ = (z + 2.0) * 0.12;
    float mound = exp(-moundX * moundX - moundZ * moundZ) * 0.16;

    // 环境波形高度（不含指针涟漪）——密度跟着它走
    float baseY = (wave * uWaveAmplitude + mound) * uTerrainHeight;
    float crest = smoothstep(-0.42, 0.72, baseY);   // 0 波谷 → 1 波峰

    float rippleBump;
    float ripple = pointerRipple(vec2(x, z), uTime, rippleBump);
    float y = baseY + ripple * uTerrainHeight;
    vRipple = rippleBump;

    // 波峰密、波谷疏：波谷只保留 ~24% 的网格点；涟漪临时把周围点召回。
    // 位置严格贴规则网格，不做任何抖动/位移——只是让部分点不显示。
    float keep = clamp(mix(0.24, 1.0, crest) + rippleBump * 0.6, 0.0, 1.0);
    float visible = 1.0 - smoothstep(keep - 0.12, keep + 0.02, aRnd);

    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mv;

    float sideFade = 1.0 - smoothstep(0.55, 1.0, abs(position.x)) * 0.86;
    float farFade = smoothstep(-1.0, -0.86, position.z);
    float nearFade = 1.0 - smoothstep(0.56, 1.0, position.z);
    float centerX = position.x * 2.4;
    float centerLift = 1.0 + exp(-centerX * centerX) * 0.42;
    vAlpha =
      sideFade * farFade * nearFade * centerLift * 0.62 *
      (1.0 + vRipple * 0.55) *
      visible;
    vRidge = smoothstep(-0.35, 0.85, y);

    float perspectiveSize = 16.0 / max(-mv.z, 1.0);
    gl_PointSize = clamp(
      (1.35 + vRidge * 0.28 + vRipple * 1.15) * uPixelRatio * perspectiveSize * uDotSize,
      0.7,
      9.0 * uPixelRatio
    ) * smoothstep(0.0, 0.14, visible);
  }
`;

const TERRAIN_FRAG = /* glsl */ `
  precision highp float;

  uniform float uBrightness;

  varying float vAlpha;
  varying float vRidge;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float outer = 1.0 - smoothstep(0.34, 0.5, d);
    float core = 1.0 - smoothstep(0.12, 0.31, d);
    // 粒子恒为纯白——指针涟漪只改高度/大小/亮度，不染色。
    float particleAlpha =
      (outer * 0.32 + core * (0.68 + vRidge * 0.18)) * vAlpha * uBrightness;
    gl_FragColor = vec4(vec3(1.0), clamp(particleAlpha, 0.0, 0.98));
  }
`;

// 下层是一张连续曲面，染成**水晶球玻璃质感**的色——玻璃色散般的珍珠虹彩，
// 颜色随波高 / 位置 / 时间在「淡紫 ↔ 蜜桃 ↔ 微青」之间缓慢移相，不是平涂一种色。
// 不再用放大的点粒子模拟阴影。它与上层白色点阵共用低频波形，
// 但位置更低、相位稍滞后。
const WAVE_SURFACE_VERT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFieldWidth;
  uniform float uWaveAmplitude;
  uniform float uSpeed;
  uniform float uTerrainHeight;
  uniform vec2  uPointer;
  uniform float uPointerStrength;
  uniform float uPointerLift;

  varying float vSurfaceAlpha;
  varying float vSurfaceHeight;
  varying float vSurfaceRipple;
  varying float vIrid;

  void main() {
    float x = position.x * uFieldWidth;
    float z = position.z * 10.5 - 3.0;
    float animTime = (uTime - 0.48) * uSpeed;

    // 虹彩相位：沿场地平面缓慢铺开，让色散色带横贯波面。
    vIrid = x * 0.085 + z * 0.12;

    float wave =
      sin(x * 0.38 + animTime * 0.24 + 0.28) * 0.48 +
      sin(z * 0.48 - animTime * 0.19 + 0.2) * 0.34 +
      sin((x + z) * 0.21 + animTime * 0.13 + 0.14) * 0.24;

    float moundX = x * 0.17;
    float moundZ = (z + 2.0) * 0.12;
    float mound = exp(-moundX * moundX - moundZ * moundZ) * 0.16;
    float y = (wave * uWaveAmplitude + mound) * uTerrainHeight - 0.31;

    vec2 pDelta = vec2(x, z) - uPointer;
    float pDist = length(pDelta);
    float r2 = 15.0;
    float bump = exp(-(pDist * pDist) / r2);
    float ring = sin(pDist * 1.4 - uTime * 4.5) * exp(-(pDist * pDist) / (r2 * 2.6));
    float ripple = (bump * 0.58 + ring * 0.38) * uPointerStrength * uPointerLift;
    y += ripple * uTerrainHeight;
    vSurfaceRipple = bump * uPointerStrength;

    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mv;

    float sideFade = 1.0 - smoothstep(0.5, 1.0, abs(position.x));
    float farFade = smoothstep(-1.0, -0.82, position.z);
    float nearFade = 1.0 - smoothstep(0.5, 1.0, position.z);
    vSurfaceAlpha = sideFade * farFade * nearFade;
    vSurfaceHeight = smoothstep(-0.72, 0.72, y + 0.31);
  }
`;

const WAVE_SURFACE_FRAG = /* glsl */ `
  precision highp float;

  uniform float uShadowStrength;
  uniform float uTime;

  varying float vSurfaceAlpha;
  varying float vSurfaceHeight;
  varying float vSurfaceRipple;
  varying float vIrid;

  void main() {
    // 水晶球玻璃质感：像球缘色散那样绕相位循环的珍珠虹彩。相位由位置 + 波高 +
    // 缓慢时间漂移驱动 → 色带横贯波面、极缓地流动，而不是平涂一种颜色。
    float phase = vIrid + vSurfaceHeight * 0.55 + uTime * 0.022;
    vec3 iris = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.66) + phase));
    // 三档水晶色，全部收进**冷调长春花紫**区间（呼应浅底），都压在浅底亮度
    // 之下才读得出「波」，按虹彩权重调和。
    vec3 lilac = vec3(0.60, 0.60, 0.78);  // 长春花紫
    vec3 mauve = vec3(0.72, 0.68, 0.80);  // 灰藕
    vec3 aqua  = vec3(0.56, 0.64, 0.82);  // 冷蓝
    vec3 crystal =
      (lilac * iris.r + mauve * iris.g + aqua * iris.b) /
      max(iris.r + iris.g + iris.b, 0.55);
    // 珠光冷白底 → 虹彩，随波高增强；波谷贴近底色，波峰虹彩最明显。
    vec3 pearl = vec3(0.83, 0.83, 0.89);
    vec3 surfaceColor = mix(pearl, crystal, 0.36 + vSurfaceHeight * 0.42);
    // 指针涟漪只抬高度、微增不透明度，不额外染色。整体保持「几乎看不见的一层
    // 薄雾」——参考稿里底部只是一丝纹理，不喧宾夺主。
    float alpha =
      (0.085 + vSurfaceHeight * 0.10 + vSurfaceRipple * 0.05) *
      vSurfaceAlpha *
      uShadowStrength;
    gl_FragColor = vec4(surfaceColor, clamp(alpha, 0.0, 0.27));
  }
`;

function buildTerrain(cols: number, rows: number) {
  // 单层**标准规则网格**（无随机抖动）。每点带一个固定随机数 aRnd，只用于
  // 顶点着色器按波形高度做密度剔除（波峰点全留 / 波谷点按 aRnd 疏掉）。
  const count = cols * rows;
  const positions = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  let i = 0;
  let r = 0;
  for (let row = 0; row < rows; row++) {
    const z = rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0;
    for (let col = 0; col < cols; col++) {
      const x = cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0;
      positions[i++] = x;
      positions[i++] = 0;
      positions[i++] = z;
      rnd[r++] = Math.random();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  return geometry;
}

function buildWaveSurface(cols: number, rows: number) {
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array((cols - 1) * (rows - 1) * 6);
  let positionIndex = 0;
  for (let row = 0; row < rows; row++) {
    const z = rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0;
    for (let col = 0; col < cols; col++) {
      const x = cols > 1 ? (col / (cols - 1)) * 2 - 1 : 0;
      positions[positionIndex++] = x;
      positions[positionIndex++] = 0;
      positions[positionIndex++] = z;
    }
  }
  let index = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const topLeft = row * cols + col;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + cols;
      const bottomRight = bottomLeft + 1;
      indices[index++] = topLeft;
      indices[index++] = bottomLeft;
      indices[index++] = topRight;
      indices[index++] = topRight;
      indices[index++] = bottomLeft;
      indices[index++] = bottomRight;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export function HeroParticleTerrain({
  className = "",
  debug = true,
}: {
  className?: string;
  debug?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uniformSetsRef = useRef<Record<string, THREE.IUniform>[]>([]);
  const renderOnceRef = useRef<(() => void) | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tuning, setTuning] = useState<TerrainTuning>(TERRAIN_DEFAULTS);
  const showPanel = DEV_TUNING_ENABLED && debug;

  useEffect(() => {
    setMounted(true);
    if (DEV_TUNING_ENABLED) setTuning(loadStoredTuning());
  }, []);

  const skipFirstPersist = useRef(true);
  useEffect(() => {
    if (!DEV_TUNING_ENABLED || typeof window === "undefined") return;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(TERRAIN_STORAGE_KEY, JSON.stringify(tuning));
    } catch {
      // 隐私模式或配额不足时保持当前预览，不阻断 WebGL。
    }
  }, [tuning]);

  useEffect(() => {
    const uniformSets = uniformSetsRef.current;
    if (uniformSets.length === 0) return;
    for (const uniforms of uniformSets) {
      uniforms.uDotSize.value = tuning.dotSize / 100;
      uniforms.uBrightness.value = tuning.brightness / 100;
      uniforms.uWaveAmplitude.value = tuning.waveAmplitude / 100;
      uniforms.uSpeed.value = tuning.speed / 100;
      uniforms.uTerrainHeight.value = tuning.terrainHeight / 100;
      uniforms.uShadowStrength.value = tuning.shadowStrength / 100;
      uniforms.uPointerLift.value = tuning.pointerLift / 100;
    }
    renderOnceRef.current?.();
  }, [tuning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const root = container;

    const reduceMotion = prefersReducedMotion();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    camera.position.set(0, 4.7, 8.6);
    camera.lookAt(0, -0.35, -3.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    root.appendChild(renderer.domElement);

    const mobile = window.innerWidth < 720;
    // 用开平方同时缩放行列，让滑块的百分比约等于最终粒子数百分比。
    const densityScale = Math.sqrt(tuning.density / 100);
    const geometry = buildTerrain(
      Math.round((mobile ? 128 : 260) * densityScale),
      Math.round((mobile ? 52 : 104) * densityScale),
    );
    const waveGeometry = buildWaveSurface(mobile ? 72 : 128, mobile ? 32 : 48);
    const createUniforms = (): Record<string, THREE.IUniform> => ({
      uTime: { value: reduceMotion ? 2.5 : 0 },
      uPixelRatio: { value: 1 },
      uFieldWidth: { value: 13 },
      uDotSize: { value: tuning.dotSize / 100 },
      uBrightness: { value: tuning.brightness / 100 },
      uWaveAmplitude: { value: tuning.waveAmplitude / 100 },
      uSpeed: { value: tuning.speed / 100 },
      uTerrainHeight: { value: tuning.terrainHeight / 100 },
      uShadowStrength: { value: tuning.shadowStrength / 100 },
      uPointer: { value: new THREE.Vector2(999, 999) },
      uPointerStrength: { value: 0 },
      uPointerLift: { value: tuning.pointerLift / 100 },
    });
    const particleUniforms = createUniforms();
    const waveUniforms = createUniforms();
    const uniformSets = [particleUniforms, waveUniforms];
    uniformSetsRef.current = uniformSets;
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: particleUniforms,
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const waveMaterial = new THREE.ShaderMaterial({
      uniforms: waveUniforms,
      vertexShader: WAVE_SURFACE_VERT,
      fragmentShader: WAVE_SURFACE_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const waveSurface = new THREE.Mesh(waveGeometry, waveMaterial);
    const terrain = new THREE.Points(geometry, particleMaterial);
    waveSurface.renderOrder = 0;
    terrain.renderOrder = 1;
    scene.add(waveSurface, terrain);

    let width = 0;
    let height = 0;

    // ── 指针涟漪：把指针投影到地面 y=0 平面，波浪在该点隆起并跟随 ──
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();
    const pointerWorld = new THREE.Vector2(999, 999); // 平滑后写进 uniform
    const pointerTarget = new THREE.Vector2(999, 999);
    let pointerStrength = 0;
    let pointerStrengthTarget = 0;

    function onPointerMove(event: PointerEvent) {
      if (width <= 0 || height <= 0) {
        pointerStrengthTarget = 0;
        return;
      }
      // canvas 贴在 sticky 舞台底部，钉住时屏幕位置 = 左 0 / 宽 innerWidth / 底对齐。
      // 只在指针进到「canvas 上沿再往上 180px」这一带才响应（"下方波浪"）。
      const rectTop = window.innerHeight - height;
      if (event.clientY < rectTop - 180) {
        pointerStrengthTarget = 0;
        return;
      }
      ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
      ndc.y = THREE.MathUtils.clamp(
        -((event.clientY - rectTop) / height) * 2 + 1,
        -1,
        1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (
        raycaster.ray.intersectPlane(groundPlane, hitPoint) &&
        hitPoint.z < 9 &&
        hitPoint.z > -20
      ) {
        if (pointerTarget.x > 900) pointerWorld.set(hitPoint.x, hitPoint.z); // 首帧不从远处滑入
        pointerTarget.set(hitPoint.x, hitPoint.z);
        pointerStrengthTarget = 1;
      } else {
        pointerStrengthTarget = 0;
      }
    }
    function releasePointer() {
      pointerStrengthTarget = 0;
    }
    function renderOnce() {
      renderer.render(scene, camera);
    }
    renderOnceRef.current = renderOnce;

    function resize() {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w <= 0 || h <= 0 || (w === width && h === height)) return;
      width = w;
      height = h;
      const dpr = Math.min(1.75, getClampedDpr());
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      for (const uniforms of uniformSets) uniforms.uPixelRatio.value = dpr;
      const wideFieldFactor = THREE.MathUtils.clamp(w / h / 3.2, 1, 1.8);
      for (const uniforms of uniformSets) {
        uniforms.uFieldWidth.value = 11.5 * wideFieldFactor;
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderOnce();
    }

    let raf = 0;
    let running = false;
    let visible = true;
    let previous = performance.now();
    function frame(now: number) {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      particleUniforms.uTime.value += dt;
      waveUniforms.uTime.value = particleUniforms.uTime.value;

      pointerStrength += (pointerStrengthTarget - pointerStrength) * Math.min(1, dt * 5.5);
      if (pointerTarget.x < 900) {
        pointerWorld.lerp(pointerTarget, Math.min(1, dt * 7));
      }
      (particleUniforms.uPointer.value as THREE.Vector2).copy(pointerWorld);
      particleUniforms.uPointerStrength.value = pointerStrength;
      (waveUniforms.uPointer.value as THREE.Vector2).copy(pointerWorld);
      waveUniforms.uPointerStrength.value = pointerStrength * 0.75;

      renderOnce();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduceMotion || !visible) return;
      running = true;
      previous = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    renderOnce();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    const disposeVisibility = createVisibilityLifecycle(root, {
      onVisible: () => {
        visible = true;
        start();
      },
      onHidden: () => {
        visible = false;
        stop();
      },
    });
    start();

    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerdown", onPointerMove, { passive: true });
      window.addEventListener("blur", releasePointer);
      document.addEventListener("mouseleave", releasePointer);
    }

    return () => {
      stop();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("blur", releasePointer);
      document.removeEventListener("mouseleave", releasePointer);
      resizeObserver.disconnect();
      disposeVisibility();
      uniformSetsRef.current = [];
      renderOnceRef.current = null;
      geometry.dispose();
      waveGeometry.dispose();
      particleMaterial.dispose();
      waveMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === root) {
        root.removeChild(renderer.domElement);
      }
    };
    // 密度会改变 geometry，只在松开密度滑块后重建一次场景。
    // 其他参数由上方 effect 直接同步 uniform。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuning.density]);

  const setValue = (key: keyof TerrainTuning, value: number) => {
    setTuning((previous) => ({ ...previous, [key]: value }));
  };

  return (
    <>
      <div
        ref={containerRef}
        aria-hidden="true"
        className={`pointer-events-none ${className}`}
        style={{
          maskImage:
            "radial-gradient(ellipse 72% 105% at 50% 28%, black 0%, rgba(0,0,0,0.88) 38%, rgba(0,0,0,0.34) 72%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 72% 105% at 50% 28%, black 0%, rgba(0,0,0,0.88) 38%, rgba(0,0,0,0.34) 72%, transparent 100%)",
        }}
      />

      {showPanel &&
        mounted &&
        createPortal(
          <div className="fixed right-3 top-[72px] bottom-3 z-[9999] w-0">
            <TuningPanelShell
              title="Hero 底部粒子场（仅开发环境）"
              widthClassName="w-[280px]"
              positionClassName="right-0 top-0"
            >
              <p className="leading-relaxed text-[#78716c]">
                密度会在松手后重建点阵，其余参数可实时预览。
              </p>
              <CommitSlider
                label="密度"
                value={tuning.density}
                min={40}
                max={180}
                step={5}
                unit="%"
                onCommit={(value) => setValue("density", value)}
              />
              <TuningSlider label="点径" value={tuning.dotSize} min={55} max={180} step={5} unit="%" onChange={(value) => setValue("dotSize", value)} />
              <TuningSlider label="亮度" value={tuning.brightness} min={30} max={170} step={5} unit="%" onChange={(value) => setValue("brightness", value)} />
              <TuningSlider label="波幅" value={tuning.waveAmplitude} min={25} max={180} step={5} unit="%" onChange={(value) => setValue("waveAmplitude", value)} />
              <TuningSlider label="速度" value={tuning.speed} min={0} max={180} step={5} unit="%" onChange={(value) => setValue("speed", value)} />
              <TuningSlider label="地形高度" value={tuning.terrainHeight} min={50} max={160} step={5} unit="%" onChange={(value) => setValue("terrainHeight", value)} />
              <TuningSlider label="水晶波浪" value={tuning.shadowStrength} min={0} max={180} step={5} unit="%" onChange={(value) => setValue("shadowStrength", value)} />
              <TuningSlider label="指针涟漪" value={tuning.pointerLift} min={0} max={200} step={5} unit="%" onChange={(value) => setValue("pointerLift", value)} />
              <button
                type="button"
                onClick={() => setTuning(TERRAIN_DEFAULTS)}
                className="mt-1 rounded-full border border-black/[0.08] px-3 py-1.5 text-[11px] text-[#78716c] transition hover:bg-black/[0.04] hover:text-[#1c1917]"
              >
                恢复默认
              </button>
            </TuningPanelShell>
          </div>,
          document.body,
        )}
    </>
  );
}
