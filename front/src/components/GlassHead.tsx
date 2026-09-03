"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  createPointerHoverState,
  createVisibilityLifecycle,
  getClampedDpr,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

// ── 星尘人形（3D 星空玻璃质感，对齐 Hero 水晶球）────────────────────
// 不再渲染实体人头（太写实、有诡异感）。改成：把人物模型表面采样成几千个
// 「虹彩玻璃珠」点，缓慢左右摆动（不整圈转），轮廓处的点向外飘散、逐渐透明，
// 融进背后的星空。配色 = Hero 水晶球那套长春花紫 / 中紫 / 靛。
//
// 素材：public/models/person.glb（已剥成纯几何体）。只取「胸部以上」——
// 低于 yCut 的点在着色器里柔和淡出。
//
// 结构参数（modelUrl / pointCount / bgStars）变化 → 重建；视觉参数走 paramsRef
// 就地更新，滑杆拖动不重建、不重采样。
// prefers-reduced-motion / WebGL 失败：渲一帧静态终态。

const MODEL_URL = "/models/person.glb";
const NORM_HEIGHT = 2.6;
const MIN_TRIANGLES = 300; // 小于这个三角数的网格（发丝 / 牙齿 / 碎片）不参与采样

// Hero 水晶球配色（LiquidOrb ORB_COLOR_DEFAULTS）
const COL_LILAC = new THREE.Color("#ccb3eb");
const COL_VIOLET = new THREE.Color("#8c57c7");

interface LiveParams {
  keepTopFraction: number;
  zoom: number;
  yOffset: number;
  modelYaw: number;
  swaySpeed: number;
  swayAmp: number;
  iridescence: number;
  edgeDrift: number;
  beadSize: number;
}

export interface GlassHeadProps {
  className?: string;
  modelUrl?: string;
  /** 采样点数，默认 22000。越多越像细星尘，越贵。结构参数（变化会重采样）。 */
  pointCount?: number;
  /** 背后是否铺一层淡星场，默认 true。 */
  bgStars?: boolean;
  /** 保留模型顶部比例（0~1），其余在着色器里柔和淡出。默认 0.3。 */
  keepTopFraction?: number;
  /** 相机推进倍数，越大人头越大。默认 1。 */
  zoom?: number;
  /** 竖向偏移（归一化单位，正=上移）。默认 0。 */
  yOffset?: number;
  /** 模型绕 Y 轴朝向修正（弧度）。默认 0。 */
  modelYaw?: number;
  /** 左右摆动速度（rad/s 的正弦频率）。默认 0.16。0 = 不摆。 */
  swaySpeed?: number;
  /** 左右摆动幅度（弧度）。默认 0.32（约 ±18°）。 */
  swayAmp?: number;
  /** 虹彩边强度 0~1。默认 1。 */
  iridescence?: number;
  /** 轮廓处点向外飘散的幅度。默认 1。 */
  edgeDrift?: number;
  /** 玻璃珠基准大小。默认 1。 */
  beadSize?: number;
}

// 大部分点 = 细小的发光星尘（加法叠加成一团有体积的星云）；少量点（seed
// > 0.9）= 大一号的水晶玻璃珠，带菲涅尔虹彩边 + 高光，点出「玻璃」质感。
const VERT = /* glsl */ `
  attribute vec3 aNormal;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uYCut;
  uniform float uYFade;
  uniform float uEdgeDrift;
  uniform float uBeadSize;
  varying float vAlpha;
  varying float vSeed;
  varying float vDepth;
  varying float vGlass;
  void main() {
    vec3 pos = position;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vec3 viewDir = normalize(cameraPosition - world.xyz);
    vec3 n = normalize(mat3(modelMatrix) * aNormal);
    float rim = pow(1.0 - abs(dot(n, viewDir)), 1.5);   // 0 正对 → 1 边缘

    // 轮廓处的点沿法线向外飘散（越靠边飘得越远，还随时间呼吸）
    float breath = 0.5 + 0.5 * sin(uTime * 0.5 + aSeed * 6.2831);
    pos += normalize(aNormal) * rim * uEdgeDrift * (0.05 + 0.13 * breath);

    // 胸部以下柔和淡出
    float yFade = smoothstep(uYCut - uYFade, uYCut + uYFade * 0.4, pos.y);
    // 边缘点更稀更透 + 每点闪烁
    float twinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aSeed * 55.0);
    float glass = step(0.9, aSeed);

    vAlpha = yFade * mix(1.0, 0.32, rim) * mix(twinkle, 0.9, glass);
    vSeed = aSeed;
    vGlass = glass;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    // 星尘很小，玻璃珠大一号
    float base = mix(0.5 + 0.5 * aSeed, 2.6 + aSeed, glass);
    gl_PointSize = clamp(uBeadSize * base * uPixelRatio * (300.0 / max(-mv.z, 0.1)),
                         0.5, 40.0 * uPixelRatio);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColLilac;
  uniform vec3 uColViolet;
  uniform float uIridescence;
  varying float vAlpha;
  varying float vSeed;
  varying float vDepth;
  varying float vGlass;
  void main() {
    if (vAlpha < 0.01) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;

    // 远的点暗一点，做出体积/前后层次（相机 z≈3~5）
    float depthFade = clamp(1.0 - (vDepth - 3.2) * 0.28, 0.35, 1.0);

    vec3 col;
    float alpha;
    if (vGlass > 0.5) {
      // 水晶玻璃珠：半球法线高光 + 菲涅尔虹彩边（同 Hero 水晶球质感）
      float z = sqrt(max(0.0, 0.25 - d * d)) * 2.0;
      vec3 N = normalize(vec3(c * 2.0, z + 0.001));
      float fres = pow(1.0 - z, 2.4);
      float ang = atan(c.y, c.x);
      vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.66) + ang * 0.159 + vSeed));
      vec3 rim = mix(vec3(0.85, 0.88, 1.0), irid, 0.5) * fres * uIridescence;
      float spec = pow(max(dot(N, normalize(vec3(-0.5, 0.62, 0.85))), 0.0), 22.0);
      col = mix(uColLilac, uColViolet, 0.4) + rim + spec;
      alpha = vAlpha * (1.0 - smoothstep(0.42, 0.5, d)) * 0.9;
    } else {
      // 细星尘：中心亮白、外圈淡紫的高斯点，加法叠加成星云
      float g = exp(-d * d * 9.0);
      col = mix(uColViolet * 0.7, mix(uColLilac, vec3(1.0), 0.55), g);
      alpha = vAlpha * g * 0.42;
    }
    gl_FragColor = vec4(col * depthFade, alpha * depthFade);
  }
`;

export function GlassHead({
  className,
  modelUrl = MODEL_URL,
  pointCount = 22000,
  bgStars = true,
  keepTopFraction = 0.3,
  zoom = 1,
  yOffset = 0,
  modelYaw = 0,
  swaySpeed = 0.16,
  swayAmp = 0.32,
  iridescence = 1,
  edgeDrift = 1,
  beadSize = 1,
}: GlassHeadProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const paramsRef = useRef<LiveParams>({
    keepTopFraction,
    zoom,
    yOffset,
    modelYaw,
    swaySpeed,
    swayAmp,
    iridescence,
    edgeDrift,
    beadSize,
  });
  const applyLiveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = prefersReducedMotion();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 4.3);

    // ── 背景星场（淡紫，缓慢反向漂）──────────────────────────────
    let bg: THREE.Points | null = null;
    if (bgStars) {
      const n = 2200;
      const p = new Float32Array(n * 3);
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const r = 12 + Math.random() * 18;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        p[i * 3] = r * Math.sin(ph) * Math.cos(th);
        p[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        p[i * 3 + 2] = r * Math.cos(ph);
        s[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(s, 1));
      bg = new THREE.Points(
        g,
        new THREE.PointsMaterial({
          size: 0.045,
          color: new THREE.Color("#cdbff0"),
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        }),
      );
      scene.add(bg);
    }

    // ── 人形点云 ──────────────────────────────────────────────
    const p0 = paramsRef.current;
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uYCut: { value: -0.2 },
      uYFade: { value: 0.28 },
      uEdgeDrift: { value: p0.edgeDrift },
      uBeadSize: { value: p0.beadSize },
      uIridescence: { value: p0.iridescence },
      uColLilac: { value: COL_LILAC.clone() },
      uColViolet: { value: COL_VIOLET.clone() },
    };
    const pointsMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const figureGroup = new THREE.Group();
    scene.add(figureGroup);
    let points: THREE.Points | null = null;
    let modelReady = false;

    function applyLive() {
      const pr = paramsRef.current;
      camera.position.z = 4.3 / Math.max(pr.zoom, 0.2);
      camera.updateProjectionMatrix();
      uniforms.uEdgeDrift.value = pr.edgeDrift;
      uniforms.uBeadSize.value = pr.beadSize;
      uniforms.uIridescence.value = THREE.MathUtils.clamp(pr.iridescence, 0, 1);
      if (modelReady) {
        const h = NORM_HEIGHT;
        const yCut = h / 2 - THREE.MathUtils.clamp(pr.keepTopFraction, 0.05, 1) * h;
        uniforms.uYCut.value = yCut;
        figureGroup.position.y = -(yCut + h / 2) / 2 + pr.yOffset;
      }
      if (!running) renderOnce();
    }
    applyLiveRef.current = applyLive;

    const manager = new THREE.LoadingManager();
    const loader = new GLTFLoader(manager);
    let disposed = false;
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        gltf.scene.updateMatrixWorld(true);

        // 收集「大网格」（跳过发丝/牙齿等碎网格），统一成「非索引 + 只留
        // position/normal + 已烘焙世界矩阵」，再合并成一个几何体。
        const geoms: THREE.BufferGeometry[] = [];
        gltf.scene.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const src = obj.geometry as THREE.BufferGeometry;
          const posAttr = src.getAttribute("position");
          if (!posAttr) return;
          const triCount = src.index ? src.index.count / 3 : posAttr.count / 3;
          if (triCount < MIN_TRIANGLES) return;

          let g = src.clone();
          for (const name of Object.keys(g.attributes)) {
            if (name !== "position" && name !== "normal") g.deleteAttribute(name);
          }
          if (!g.getAttribute("normal")) g.computeVertexNormals();
          if (g.index) g = g.toNonIndexed();
          g.applyMatrix4(obj.matrixWorld);
          geoms.push(g);
        });
        if (!geoms.length) {
          console.warn("[GlassHead] 模型里没有可采样的大网格");
          return;
        }
        const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
        geoms.forEach((g) => g.dispose());
        if (!merged) {
          console.warn("[GlassHead] 网格合并失败");
          return;
        }

        // 归一化：缩放到高度 NORM_HEIGHT、居中到原点
        merged.computeBoundingBox();
        const bb = merged.boundingBox!;
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bb.getSize(size);
        bb.getCenter(center);
        const norm = NORM_HEIGHT / Math.max(size.y, 1e-3);
        merged.translate(-center.x, -center.y, -center.z);
        merged.scale(norm, norm, norm);
        merged.computeVertexNormals();

        // 表面采样 → 点云属性
        const tmpMesh = new THREE.Mesh(merged);
        const sampler = new MeshSurfaceSampler(tmpMesh).build();
        const N = Math.max(1000, Math.round(pointCount));
        const pos = new Float32Array(N * 3);
        const nrm = new Float32Array(N * 3);
        const seed = new Float32Array(N);
        const P = new THREE.Vector3();
        const Nv = new THREE.Vector3();
        for (let i = 0; i < N; i++) {
          sampler.sample(P, Nv);
          pos[i * 3] = P.x;
          pos[i * 3 + 1] = P.y;
          pos[i * 3 + 2] = P.z;
          nrm[i * 3] = Nv.x;
          nrm[i * 3 + 1] = Nv.y;
          nrm[i * 3 + 2] = Nv.z;
          seed[i] = Math.random();
        }
        merged.dispose();

        const pg = new THREE.BufferGeometry();
        pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        pg.setAttribute("aNormal", new THREE.BufferAttribute(nrm, 3));
        pg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
        points = new THREE.Points(pg, pointsMat);
        points.frustumCulled = false;
        figureGroup.add(points);

        modelReady = true;
        applyLive();
        renderOnce();
      },
      undefined,
      () => {
        if (!disposed) console.warn(`[GlassHead] 模型加载失败：${modelUrl}`);
      },
    );

    // ── 尺寸 ──────────────────────────────────────────────────
    let vw = 0;
    let vh = 0;
    function resize() {
      const w = mount!.clientWidth;
      const hh = mount!.clientHeight;
      if (w === vw && hh === vh) return;
      vw = w;
      vh = hh;
      const dpr = Math.min(1.75, getClampedDpr());
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, hh, false);
      uniforms.uPixelRatio.value = dpr;
      camera.aspect = w / Math.max(hh, 1);
      camera.updateProjectionMatrix();
      renderOnce();
    }

    // ── 鼠标视差 ──────────────────────────────────────────────
    const pointer = createPointerHoverState(0.1);
    function onPointerMove(e: PointerEvent) {
      const rect = mount!.getBoundingClientRect();
      if (rect.width <= 0) return;
      pointer.setActive((e.clientX - rect.left) / rect.width - 0.5, (e.clientY - rect.top) / rect.height - 0.5);
    }
    function onPointerLeave() {
      pointer.setInactive();
    }
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);

    // ── 渲染循环 ──────────────────────────────────────────────
    let raf = 0;
    let running = false;
    const t0 = performance.now();

    function renderOnce() {
      renderer.render(scene, camera);
    }
    function frame() {
      const t = (performance.now() - t0) / 1000;
      uniforms.uTime.value = t;
      pointer.tick();
      const pr = paramsRef.current;
      // 左右轻摆（不整圈转）+ 鼠标视差 + 极缓上下浮
      figureGroup.rotation.y = pr.modelYaw + Math.sin(t * pr.swaySpeed) * pr.swayAmp + pointer.x * 0.35;
      figureGroup.rotation.x = Math.sin(t * pr.swaySpeed * 0.7) * 0.06 - pointer.y * 0.22;
      figureGroup.position.x = pointer.x * 0.15;
      if (bg) bg.rotation.y = -t * 0.012;
      renderOnce();
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();
    applyLive();

    let disposeVisibility = () => {};
    if (reduce) renderOnce();
    else disposeVisibility = createVisibilityLifecycle(mount, { onVisible: start, onHidden: stop });

    return () => {
      disposed = true;
      applyLiveRef.current = null;
      stop();
      disposeVisibility();
      ro.disconnect();
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      points?.geometry.dispose();
      pointsMat.dispose();
      if (bg) {
        bg.geometry.dispose();
        (bg.material as THREE.Material).dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [modelUrl, pointCount, bgStars]);

  useEffect(() => {
    paramsRef.current = {
      keepTopFraction,
      zoom,
      yOffset,
      modelYaw,
      swaySpeed,
      swayAmp,
      iridescence,
      edgeDrift,
      beadSize,
    };
    applyLiveRef.current?.();
  }, [keepTopFraction, zoom, yOffset, modelYaw, swaySpeed, swayAmp, iridescence, edgeDrift, beadSize]);

  return <div ref={mountRef} aria-hidden className={`size-full ${className ?? ""}`} />;
}
