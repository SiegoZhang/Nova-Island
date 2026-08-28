"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import {
  CommitColorPicker,
  CommitSlider,
  persistDotTuningValue,
  TuningPanelShell,
  TuningSlider,
} from "@/components/dotSystemTuningControls";
import {
  createPointerHoverState,
  createVisibilityLifecycle,
  getClampedDpr,
  manageVideoElement,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

// 「成为领航员」的视觉——跟 FlagVisual/ToolDotMatrix/SphereConnectDotMatrix
// 同一套实现逻辑：单层点阵，驱动源是循环视频（assets/领航员视频.mp4，AI
// 生成，白色线框人像缓慢转动）。视频背景纯黑（实测 rgb(1,1,1) 全画面统一），
// 靠亮度阈值就能干净地把黑色背景裁掉，不需要色键。
//
// 源文件是 3840×2160 @ 40s 的 4K 素材（147MB）——这套点阵渲染只把视频采样
// 到几十×几十的低分辨率网格，4K 原画完全用不上，只会拖慢首屏加载，所以
// 用 avconvert 转成 960×540（Preset960x540）再放进 public/videos，体积降到
// 21MB，跟其他几支素材视频同一量级。

const VERTEX_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uPixelRatio;
  uniform float uDotMin;
  uniform float uDotMax;
  uniform float uThreshold;
  uniform float uSoftness;
  uniform float uContrast;
  uniform float uFadeStart;
  uniform vec2 uPointer;
  uniform float uPointerRadius;
  uniform float uPointerActivity;
  uniform float uPointerAttract;
  uniform float uPointerSizeBoost;
  // 鼠标"冲散"：半径内的点沿背离光标的方向被推开（越靠近推得越狠），
  // 配一点每点随机的偏转，看起来像划过时把粒子拨开、身后再涌回。
  uniform float uPointerScatter;
  // ── 粒子散布（0 = 关闭，回到规整网格点阵）────────────────────
  uniform float uJitter;       // 均匀位置抖动，打散"网格感"（本地坐标单位，全幅=1）
  uniform float uEdgeSpray;    // 人像轮廓处的点额外沿径向往外喷，形成飘散的边缘
  uniform float uSizeVariance; // 每点大小随机幅度 0~1

  attribute vec2 aUv;

  varying float vLuminance;
  varying float vMask;
  // 鼠标邻近强度（0~1，越靠近光标越大），传给片元着色器做染色。
  varying float vPointerGlow;

  // 无依赖 hash：把 UV 当种子生成 0~1 伪随机数，用来给每个点独立的抖动/
  // 大小偏移。同一个点每帧结果一致（种子只跟 aUv 有关），所以粒子是"定
  // 格散开"而不是每帧乱跳。
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  void main() {
    vec3 texel = texture2D(uTexture, aUv).rgb;
    float luminance = dot(texel, vec3(0.299, 0.587, 0.114));
    luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

    float mask = smoothstep(uThreshold, uThreshold + uSoftness, luminance);

    // 位移完全静态：只跟 aUv（+ 点到中心的距离）有关，逐帧不变——之前把
    // 抖动/喷散幅度乘上了逐帧亮度算出来的 edgeFactor，视频一动，同一个点
    // 的偏移量就来回变，看起来就是"粒子上下乱跳"。现在：
    //   · uJitter：固定的小抖动，纯粹打散网格感
    //   · uEdgeSpray：越靠外缘的点整体往外挪越多（按到中心的距离，不是
    //     按亮度），做出松散的外圈，但每个点挪多少是定死的
    vec2 basePos = position.xy;
    float radiusFromCenter = length(basePos);
    vec2 jittered = basePos + (hash22(aUv * 141.7) - 0.5) * uJitter;
    vec2 radial = basePos / (radiusFromCenter + 1e-4);
    float rimWeight = smoothstep(0.12, 0.46, radiusFromCenter);
    jittered += radial * uEdgeSpray * rimWeight * hash12(aUv * 71.3);

    vec2 edgeDist = abs(jittered);
    float fadeX = 1.0 - smoothstep(uFadeStart, 0.5, edgeDist.x);
    float fadeY = 1.0 - smoothstep(uFadeStart, 0.5, edgeDist.y);
    mask *= fadeX * fadeY;

    vLuminance = luminance;
    vMask = mask;

    // 鼠标"吸附"：半径内已经可见的点朝鼠标位置轻微偏移 + 放大。
    vec2 toPointer = uPointer - jittered;
    float pointerDist = length(toPointer);
    float pointerFalloff = 1.0 - smoothstep(0.0, uPointerRadius, pointerDist);
    float pointerGlow = pointerFalloff * uPointerActivity * step(0.003, mask);
    vPointerGlow = pointerGlow;

    vec3 warpedPosition = vec3(jittered, 0.0);
    warpedPosition.xy += toPointer * pointerGlow * uPointerAttract;

    // 冲散：沿背离光标方向推开（单位向量 → 越近推得越狠靠 pointerFalloff），
    // 再叠一点每点固定的随机偏转，避免推成一个规整的圆洞。
    vec2 awayDir = -toPointer / (pointerDist + 1e-4);
    vec2 scatterNoise = (hash22(aUv * 217.3) - 0.5) * 1.1;
    float scatterAmt = pointerFalloff * uPointerActivity * step(0.003, mask) * uPointerScatter;
    warpedPosition.xy += (awayDir + scatterNoise) * scatterAmt;

    vec4 mvPosition = modelViewMatrix * vec4(warpedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float size = mix(uDotMin, uDotMax, mask);
    size *= mix(1.0 - uSizeVariance, 1.0 + uSizeVariance * 0.4, hash12(aUv * 23.7));
    size *= 1.0 + pointerGlow * uPointerSizeBoost;
    gl_PointSize = size * uPixelRatio;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform vec3 uColorGlow;
  uniform vec3 uHoverColor;
  uniform float uHoverStrength;
  uniform float uMaxAlpha;

  varying float vLuminance;
  varying float vMask;
  varying float vPointerGlow;

  void main() {
    if (vMask < 0.003) discard;

    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    float circle = 1.0 - smoothstep(0.32, 0.5, dist);
    if (circle <= 0.0) discard;

    // 主色调：按亮度在两档灰（uColorLow→uColorGlow）之间插值，形成点阵纹理。
    float lum = clamp(vLuminance, 0.0, 1.0);
    vec3 color = mix(uColorLow, uColorGlow, lum);
    // 少量高光：仅亮度最高的一小段染成高光色 uColorHigh。
    color = mix(color, uColorHigh, smoothstep(0.72, 0.95, lum));
    // 鼠标邻近染色：离光标越近的点越往 uHoverColor 偏。
    color = mix(color, uHoverColor, clamp(vPointerGlow * uHoverStrength, 0.0, 1.0));
    float alpha = circle * vMask * uMaxAlpha;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface NavigatorDotCoreProps {
  src: string;
  gridCols: number;
  gridRows: number;
  dotMaxSize: number;
  dotMinSize: number;
  opacityThreshold: number;
  softness: number;
  contrast: number;
  edgeFadeStart: number;
  colorLow: string;
  colorHigh: string;
  colorGlow: string;
  hoverColor: string;
  hoverStrength: number;
  jitter: number;
  edgeSpray: number;
  sizeVariance: number;
  background: string;
  maxAlpha: number;
  speed: number;
  transparentBackground?: boolean;
  pointerRadius: number;
  pointerAttract: number;
  pointerSizeBoost: number;
  pointerScatter: number;
}

function NavigatorDotCore({
  src,
  gridCols,
  gridRows,
  dotMaxSize,
  dotMinSize,
  opacityThreshold,
  softness,
  contrast,
  edgeFadeStart,
  colorLow,
  colorHigh,
  colorGlow,
  hoverColor,
  hoverStrength,
  jitter,
  edgeSpray,
  sizeVariance,
  background,
  maxAlpha,
  speed,
  transparentBackground = false,
  pointerRadius,
  pointerAttract,
  pointerSizeBoost,
  pointerScatter,
}: NavigatorDotCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sizeScaleRef = useRef(1);
  const dotMinBaseRef = useRef(dotMinSize);
  const dotMaxBaseRef = useRef(dotMaxSize);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = prefersReducedMotion();

    const video = document.createElement("video");
    // src 赋值 / loop / muted / playsInline / preload 及加载时机交给
    // manageVideoElement（见下方）统一管，这里只留组件自己关心的 playbackRate。
    video.playbackRate = Math.min(4, Math.max(0.1, speed));

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

    const pointCount = gridCols * gridRows;
    const positions = new Float32Array(pointCount * 3);
    const uvs = new Float32Array(pointCount * 2);

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
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aUv", new THREE.BufferAttribute(uvs, 2));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uPixelRatio: { value: 1 },
        uDotMin: { value: dotMinSize },
        uDotMax: { value: dotMaxSize },
        uThreshold: { value: opacityThreshold },
        uSoftness: { value: softness },
        uContrast: { value: contrast },
        uFadeStart: { value: Math.min(0.499, Math.max(0, edgeFadeStart)) },
        uColorLow: { value: new THREE.Color(colorLow) },
        uColorHigh: { value: new THREE.Color(colorHigh) },
        uColorGlow: { value: new THREE.Color(colorGlow) },
        uHoverColor: { value: new THREE.Color(hoverColor) },
        uHoverStrength: { value: hoverStrength },
        uJitter: { value: jitter },
        uEdgeSpray: { value: edgeSpray },
        uSizeVariance: { value: sizeVariance },
        uMaxAlpha: { value: maxAlpha },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uPointerRadius: { value: pointerRadius },
        uPointerActivity: { value: 0 },
        uPointerAttract: { value: pointerAttract },
        uPointerSizeBoost: { value: pointerSizeBoost },
        uPointerScatter: { value: pointerScatter },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });

    materialRef.current = material;

    const points = new THREE.Points(geometry, material);

    const scene = new THREE.Scene();
    scene.add(points);

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
    let referenceWidth = 0;
    const pointerHover = createPointerHoverState();

    function handlePointerMove(event: PointerEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const u = (event.clientX - rect.left) / rect.width;
      const v = (event.clientY - rect.top) / rect.height;
      pointerHover.setActive(u - 0.5, 0.5 - v);
    }

    function handlePointerLeave() {
      pointerHover.setInactive();
    }

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

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
      sizeScaleRef.current = sizeScale;
      material.uniforms.uDotMin.value = dotMinBaseRef.current * sizeScale;
      material.uniforms.uDotMax.value = dotMaxBaseRef.current * sizeScale;

      const dpr = getClampedDpr();
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      material.uniforms.uPixelRatio.value = dpr;

      camera.left = -0.5;
      camera.right = 0.5;
      camera.top = 0.5;
      camera.bottom = -0.5;
      camera.updateProjectionMatrix();

      renderOnce();
    }

    function renderOnce() {
      drawSample();
      const pointerActivity = pointerHover.tick();
      material.uniforms.uPointerActivity.value = pointerActivity;
      (material.uniforms.uPointer.value as THREE.Vector2).set(pointerHover.x, pointerHover.y);
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
        renderOnce();
        start();
      },
      onError: () => {
        renderOnce();
      },
    });

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
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      managedVideo.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      if (materialRef.current === material) materialRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, gridCols, gridRows]);

  useEffect(() => {
    dotMinBaseRef.current = dotMinSize;
    dotMaxBaseRef.current = dotMaxSize;
    const material = materialRef.current;
    if (!material) return;
    const sizeScale = sizeScaleRef.current;
    material.uniforms.uDotMin.value = dotMinSize * sizeScale;
    material.uniforms.uDotMax.value = dotMaxSize * sizeScale;
    material.uniforms.uThreshold.value = opacityThreshold;
    material.uniforms.uSoftness.value = softness;
    material.uniforms.uContrast.value = contrast;
    (material.uniforms.uColorLow.value as THREE.Color).set(colorLow);
    (material.uniforms.uColorHigh.value as THREE.Color).set(colorHigh);
    (material.uniforms.uHoverColor.value as THREE.Color).set(hoverColor);
    material.uniforms.uHoverStrength.value = hoverStrength;
    material.uniforms.uJitter.value = jitter;
    material.uniforms.uEdgeSpray.value = edgeSpray;
    material.uniforms.uSizeVariance.value = sizeVariance;
    material.uniforms.uMaxAlpha.value = maxAlpha;
    material.uniforms.uPointerRadius.value = pointerRadius;
    material.uniforms.uPointerAttract.value = pointerAttract;
    material.uniforms.uPointerSizeBoost.value = pointerSizeBoost;
    material.uniforms.uPointerScatter.value = pointerScatter;
  }, [
    dotMinSize,
    dotMaxSize,
    opacityThreshold,
    softness,
    contrast,
    colorLow,
    colorHigh,
    hoverColor,
    hoverStrength,
    jitter,
    edgeSpray,
    sizeVariance,
    maxAlpha,
    pointerRadius,
    pointerAttract,
    pointerSizeBoost,
    pointerScatter,
    ]);

  return (
    // pointer-events:none 去掉了——鼠标悬浮吸附效果需要收到
    // pointermove。这层没有自己的 onClick，事件照样冒泡到外层卡片的
    // onClick；「探索详情」按钮在更高的 z-10 层，命中测试轮不到这一层。
    <div ref={containerRef} aria-hidden="true" className="size-full" />
  );
}

// ---- 默认参数 + 外层调参面板 --------------------------------------------

const NAVIGATOR_VIDEO_SRC = "/videos/navigator.mp4";

const DEFAULT_GRID_COLS = 74;
const DEFAULT_GRID_ROWS = 60;

const NAVIGATOR_DEFAULTS = {
  density: 1.8,
  dotMaxSize: 4.6,
  dotMinSize: 0,
  opacityThreshold: 0.05,
  softness: 0.5,
  contrast: 1.4,
  edgeFadeStart: 0.5,
  colorLow: "#d0d0d0",
  colorHigh: "#ffffff",
  colorGlow: "#e8e8e8",
  /** 鼠标邻近染色的目标色 + 强度（0=不染色，1=光标处完全变成该色）。
   *  默认 0：悬浮只做粒子收拢，不染色。着色器/uniform 保留，想启用把
   *  hoverStrength 调回 1 即可。 */
  hoverColor: "#f59e0b",
  hoverStrength: 0,
  /** 粒子散布：默认全 0 = 规整网格点阵（/ai 页手风琴维持原样）。
   *  首页「频谱仪表盘」传非 0 值把人像打散成飘散的粒子云。 */
  jitter: 0,
  edgeSpray: 0,
  sizeVariance: 0,
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  blurPx: 0,
  rightShiftPercent: 16,
  downShiftPercent: 0,
  /** 整体缩放——跟 RingSphereDotMatrix 的 sizePercent 同一套做法，靠 CSS
   *  transform: scale() 实现，不改网格密度/点径，纯粹放大缩小视觉主体。 */
  sizePercent: 100,
  /** 鼠标影响半径，跟顶点局部坐标系同单位（-0.5~0.5）。 */
  pointerRadius: 0.16,
  /** 鼠标"吸附"力度——半径内的点朝鼠标位置额外偏移的比例。 */
  pointerAttract: 0.35,
  /** 鼠标"冲散"力度——半径内的点沿背离光标方向被推开的幅度（本地坐标
   *  单位）。默认 0：只吸附不冲散。首页实例传非 0 做划过拨散粒子的效果。 */
  pointerScatter: 0,
  /** 鼠标悬浮处的点在原本亮度决定的大小基础上再叠加的放大倍数。 */
  pointerSizeBoost: 1.2,
} as const;

export interface NavigatorDotMatrixProps {
  className?: string;
  background?: string;
  /**
   * 开发环境调参面板的写回目标（persistDotTuningValue 的 componentId）。
   * 默认 "navigator" → 写回本文件 NAVIGATOR_DEFAULTS（/ai 手风琴用）。
   * 首页 AI 社群实例传 "aiCommunityNavigator" → 写回 AiCommunityCarousel.tsx
   * 的 AI_COMMUNITY_NAVIGATOR_DEFAULTS，两处调参互不干扰。
   */
  tuningId?: string;
  /** 精简调参面板：只留「构图 / 鼠标悬浮 / 粒子散布」，隐藏颜色/抠像档位
   *  （首页实例这些字段用 NAVIGATOR_DEFAULTS，面板里调了也存不回去）。 */
  compactTuning?: boolean;
  /** 鼠标邻近染色目标色，默认取 NAVIGATOR_DEFAULTS.hoverColor（琥珀）。 */
  hoverColor?: string;
  /** 整体缩放（%），默认 100。首页「频谱仪表盘」传更大的值把人像放大。 */
  sizePercent?: number;
  /** 整体右移（%），默认 16。首页需要居中时传 0。 */
  rightShiftPercent?: number;
  /** 整体下移（%），默认 0。 */
  downShiftPercent?: number;
  /** 鼠标影响半径（顶点局部坐标单位 -0.5~0.5），默认 0.16。 */
  pointerRadius?: number;
  /** 网格密度倍率，默认 NAVIGATOR_DEFAULTS.density。首页调高做更密的粒子。 */
  density?: number;
  /** 点径（px），默认 NAVIGATOR_DEFAULTS.dotMaxSize。粒子多时调小。 */
  dotMaxSize?: number;
  /** 位置抖动，打散网格感（本地坐标单位，0=关闭）。 */
  jitter?: number;
  /** 人像轮廓处的点沿径向往外喷散的强度（0=关闭）。 */
  edgeSpray?: number;
  /** 每点大小的随机幅度 0~1（0=关闭）。 */
  sizeVariance?: number;
  /** 鼠标"收拢"力度——半径内的点朝光标偏移的比例，默认 0.35。 */
  pointerAttract?: number;
  /** 鼠标"冲散"力度——半径内的点沿背离光标方向被推开，默认 0（不冲散）。 */
  pointerScatter?: number;
  /** 鼠标悬浮处点的额外放大倍数，默认 1.2。传小值/0 只收拢不放大。 */
  pointerSizeBoost?: number;
}

export function NavigatorDotMatrix({
  className,
  background = NAVIGATOR_DEFAULTS.background,
  tuningId = "navigator",
  compactTuning = false,
  hoverColor: hoverColorProp,
  sizePercent: sizePercentProp,
  rightShiftPercent: rightShiftPercentProp,
  downShiftPercent: downShiftPercentProp,
  pointerRadius: pointerRadiusProp,
  density: densityProp,
  dotMaxSize: dotMaxSizeProp,
  jitter: jitterProp,
  edgeSpray: edgeSprayProp,
  sizeVariance: sizeVarianceProp,
  pointerAttract: pointerAttractProp,
  pointerSizeBoost: pointerSizeBoostProp,
  pointerScatter: pointerScatterProp,
}: NavigatorDotMatrixProps) {
  const [density, setDensity] = useState<number>(densityProp ?? NAVIGATOR_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(
    dotMaxSizeProp ?? NAVIGATOR_DEFAULTS.dotMaxSize,
  );
  const [opacityThreshold, setOpacityThreshold] = useState<number>(
    NAVIGATOR_DEFAULTS.opacityThreshold,
  );
  const [softness, setSoftness] = useState<number>(NAVIGATOR_DEFAULTS.softness);
  const [contrast, setContrast] = useState<number>(NAVIGATOR_DEFAULTS.contrast);
  const [colorLow, setColorLow] = useState<string>(NAVIGATOR_DEFAULTS.colorLow);
  const [colorHigh, setColorHigh] = useState<string>(NAVIGATOR_DEFAULTS.colorHigh);
  const [hoverColor, setHoverColor] = useState<string>(
    hoverColorProp ?? NAVIGATOR_DEFAULTS.hoverColor,
  );
  const [blurPx, setBlurPx] = useState<number>(NAVIGATOR_DEFAULTS.blurPx);
  const [rightShiftPercent, setRightShiftPercent] = useState<number>(
    rightShiftPercentProp ?? NAVIGATOR_DEFAULTS.rightShiftPercent,
  );
  const [downShiftPercent, setDownShiftPercent] = useState<number>(
    downShiftPercentProp ?? NAVIGATOR_DEFAULTS.downShiftPercent,
  );
  const [sizePercent, setSizePercent] = useState<number>(
    sizePercentProp ?? NAVIGATOR_DEFAULTS.sizePercent,
  );
  const [pointerRadius, setPointerRadius] = useState<number>(
    pointerRadiusProp ?? NAVIGATOR_DEFAULTS.pointerRadius,
  );
  const [pointerAttract, setPointerAttract] = useState<number>(
    pointerAttractProp ?? NAVIGATOR_DEFAULTS.pointerAttract,
  );
  const [pointerSizeBoost, setPointerSizeBoost] = useState<number>(
    pointerSizeBoostProp ?? NAVIGATOR_DEFAULTS.pointerSizeBoost,
  );
  const [pointerScatter, setPointerScatter] = useState<number>(
    pointerScatterProp ?? NAVIGATOR_DEFAULTS.pointerScatter,
  );
  const [jitter, setJitter] = useState<number>(jitterProp ?? NAVIGATOR_DEFAULTS.jitter);
  const [edgeSpray, setEdgeSpray] = useState<number>(
    edgeSprayProp ?? NAVIGATOR_DEFAULTS.edgeSpray,
  );
  const [sizeVariance, setSizeVariance] = useState<number>(
    sizeVarianceProp ?? NAVIGATOR_DEFAULTS.sizeVariance,
  );

  const effectiveCols = Math.max(4, Math.round(DEFAULT_GRID_COLS * density));
  const effectiveRows = Math.max(4, Math.round(DEFAULT_GRID_ROWS * density));

  const sharedProps = {
    src: NAVIGATOR_VIDEO_SRC,
    gridCols: effectiveCols,
    gridRows: effectiveRows,
    dotMaxSize,
    dotMinSize: NAVIGATOR_DEFAULTS.dotMinSize,
    opacityThreshold,
    softness,
    contrast,
    edgeFadeStart: NAVIGATOR_DEFAULTS.edgeFadeStart,
    colorLow,
    colorHigh,
    colorGlow: NAVIGATOR_DEFAULTS.colorGlow,
    hoverColor,
    hoverStrength: NAVIGATOR_DEFAULTS.hoverStrength,
    jitter,
    edgeSpray,
    sizeVariance,
    background,
    maxAlpha: NAVIGATOR_DEFAULTS.maxAlpha,
    speed: NAVIGATOR_DEFAULTS.speed,
    transparentBackground: true,
      pointerRadius,
    pointerAttract,
    pointerSizeBoost,
    pointerScatter,
  };

  return (
    <div className={`relative size-full overflow-hidden ${className ?? ""}`}>
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${rightShiftPercent}%) translateY(${downShiftPercent}%) scale(${sizePercent / 100})`,
          filter: `blur(${blurPx}px)`,
        }}
      >
        <NavigatorDotCore {...sharedProps} />
      </div>

      {process.env.NODE_ENV !== "production" && (
        <NavigatorTuningPanel
          componentId={tuningId}
          compact={compactTuning}
          density={density}
          onDensityChange={setDensity}
          dotMaxSize={dotMaxSize}
          onDotMaxSizeChange={setDotMaxSize}
          opacityThreshold={opacityThreshold}
          onOpacityThresholdChange={setOpacityThreshold}
          softness={softness}
          onSoftnessChange={setSoftness}
          contrast={contrast}
          onContrastChange={setContrast}
          colorLow={colorLow}
          onColorLowChange={setColorLow}
          colorHigh={colorHigh}
          onColorHighChange={setColorHigh}
          blurPx={blurPx}
          onBlurPxChange={setBlurPx}
          rightShiftPercent={rightShiftPercent}
          onRightShiftPercentChange={setRightShiftPercent}
          downShiftPercent={downShiftPercent}
          onDownShiftPercentChange={setDownShiftPercent}
          sizePercent={sizePercent}
          onSizePercentChange={setSizePercent}
          pointerRadius={pointerRadius}
          onPointerRadiusChange={setPointerRadius}
          pointerAttract={pointerAttract}
          onPointerAttractChange={setPointerAttract}
          pointerSizeBoost={pointerSizeBoost}
          onPointerSizeBoostChange={setPointerSizeBoost}
          pointerScatter={pointerScatter}
          onPointerScatterChange={setPointerScatter}
          hoverColor={hoverColor}
          onHoverColorChange={setHoverColor}
          jitter={jitter}
          onJitterChange={setJitter}
          edgeSpray={edgeSpray}
          onEdgeSprayChange={setEdgeSpray}
          sizeVariance={sizeVariance}
          onSizeVarianceChange={setSizeVariance}
        />
      )}
    </div>
  );
}

function NavigatorTuningPanel({
  componentId,
  compact,
  density,
  onDensityChange,
  dotMaxSize,
  onDotMaxSizeChange,
  opacityThreshold,
  onOpacityThresholdChange,
  softness,
  onSoftnessChange,
  contrast,
  onContrastChange,
  colorLow,
  onColorLowChange,
  colorHigh,
  onColorHighChange,
  blurPx,
  onBlurPxChange,
  rightShiftPercent,
  onRightShiftPercentChange,
  downShiftPercent,
  onDownShiftPercentChange,
  sizePercent,
  onSizePercentChange,
  pointerRadius,
  onPointerRadiusChange,
  pointerAttract,
  onPointerAttractChange,
  pointerSizeBoost,
  onPointerSizeBoostChange,
  pointerScatter,
  onPointerScatterChange,
  hoverColor,
  onHoverColorChange,
  jitter,
  onJitterChange,
  edgeSpray,
  onEdgeSprayChange,
  sizeVariance,
  onSizeVarianceChange,
}: {
  componentId: string;
  compact: boolean;
  density: number;
  onDensityChange: (value: number) => void;
  dotMaxSize: number;
  onDotMaxSizeChange: (value: number) => void;
  opacityThreshold: number;
  onOpacityThresholdChange: (value: number) => void;
  softness: number;
  onSoftnessChange: (value: number) => void;
  contrast: number;
  onContrastChange: (value: number) => void;
  colorLow: string;
  onColorLowChange: (value: string) => void;
  colorHigh: string;
  onColorHighChange: (value: string) => void;
  blurPx: number;
  onBlurPxChange: (value: number) => void;
  rightShiftPercent: number;
  onRightShiftPercentChange: (value: number) => void;
  downShiftPercent: number;
  onDownShiftPercentChange: (value: number) => void;
  sizePercent: number;
  onSizePercentChange: (value: number) => void;
  pointerRadius: number;
  onPointerRadiusChange: (value: number) => void;
  pointerAttract: number;
  onPointerAttractChange: (value: number) => void;
  pointerSizeBoost: number;
  onPointerSizeBoostChange: (value: number) => void;
  pointerScatter: number;
  onPointerScatterChange: (value: number) => void;
  hoverColor: string;
  onHoverColorChange: (value: string) => void;
  jitter: number;
  onJitterChange: (value: number) => void;
  edgeSpray: number;
  onEdgeSprayChange: (value: number) => void;
  sizeVariance: number;
  onSizeVarianceChange: (value: number) => void;
}) {
  return (
    <TuningPanelShell title="领航员点阵调参（仅开发环境可见）">
      <div className="flex flex-col gap-2">
        <CommitSlider
          label="密度"
          value={density}
          min={0.2}
          max={2}
          step={0.05}
          unit="×"
          onCommit={(v) => {
            onDensityChange(v);
            persistDotTuningValue(componentId,"density", v);
          }}
        />
        <TuningSlider
          label="点径"
          value={dotMaxSize}
          min={1}
          max={14}
          step={0.1}
          unit="px"
          onChange={onDotMaxSizeChange}
          onCommit={(v) => persistDotTuningValue(componentId,"dotMaxSize", v)}
        />
        <TuningSlider
          label="右移"
          value={rightShiftPercent}
          min={-20}
          max={40}
          step={1}
          unit="%"
          onChange={onRightShiftPercentChange}
          onCommit={(v) => persistDotTuningValue(componentId,"rightShiftPercent", v)}
        />
        <TuningSlider
          label="下移"
          value={downShiftPercent}
          min={-40}
          max={40}
          step={1}
          unit="%"
          onChange={onDownShiftPercentChange}
          onCommit={(v) => persistDotTuningValue(componentId,"downShiftPercent", v)}
        />
        <TuningSlider
          label="大小"
          value={sizePercent}
          min={40}
          max={240}
          step={1}
          unit="%"
          onChange={onSizePercentChange}
          onCommit={(v) => persistDotTuningValue(componentId,"sizePercent", v)}
        />
      </div>

      {!compact && (
      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">亮度（黑底抠像）</p>
        <TuningSlider
          label="阈值"
          value={opacityThreshold}
          min={0}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onOpacityThresholdChange}
          onCommit={(v) => persistDotTuningValue(componentId,"opacityThreshold", v)}
        />
        <TuningSlider
          label="柔化"
          value={softness}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onSoftnessChange}
          onCommit={(v) => persistDotTuningValue(componentId,"softness", v)}
        />
        <TuningSlider
          label="对比度"
          value={contrast}
          min={0.5}
          max={2.5}
          step={0.05}
          unit=""
          onChange={onContrastChange}
          onCommit={(v) => persistDotTuningValue(componentId,"contrast", v)}
        />
      </div>
      )}

      {!compact && (
      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">颜色 / 模糊</p>
        <TuningSlider
          label="模糊度"
          value={blurPx}
          min={0}
          max={16}
          step={0.5}
          unit="px"
          onChange={onBlurPxChange}
          onCommit={(v) => persistDotTuningValue(componentId,"blurPx", v)}
        />
        <CommitColorPicker
          label="暗部"
          value={colorLow}
          onCommit={(v) => {
            onColorLowChange(v);
            persistDotTuningValue(componentId,"colorLow", v);
          }}
        />
        <CommitColorPicker
          label="亮部"
          value={colorHigh}
          onCommit={(v) => {
            onColorHighChange(v);
            persistDotTuningValue(componentId,"colorHigh", v);
          }}
        />
      </div>
      )}

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">鼠标悬浮吸附</p>
        <TuningSlider
          label="半径"
          value={pointerRadius}
          min={0.04}
          max={0.4}
          step={0.01}
          unit=""
          onChange={onPointerRadiusChange}
          onCommit={(v) => persistDotTuningValue(componentId,"pointerRadius", v)}
        />
        <TuningSlider
          label="吸附力"
          value={pointerAttract}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={onPointerAttractChange}
          onCommit={(v) => persistDotTuningValue(componentId,"pointerAttract", v)}
        />
        <TuningSlider
          label="冲散"
          value={pointerScatter}
          min={0}
          max={0.2}
          step={0.005}
          unit=""
          onChange={onPointerScatterChange}
          onCommit={(v) => persistDotTuningValue(componentId,"pointerScatter", v)}
        />
        <TuningSlider
          label="放大"
          value={pointerSizeBoost}
          min={0}
          max={3}
          step={0.05}
          unit="×"
          onChange={onPointerSizeBoostChange}
          onCommit={(v) => persistDotTuningValue(componentId,"pointerSizeBoost", v)}
        />
        <CommitColorPicker
          label="染色"
          value={hoverColor}
          onCommit={(v) => {
            onHoverColorChange(v);
            persistDotTuningValue(componentId,"hoverColor", v);
          }}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">粒子散布</p>
        <TuningSlider
          label="抖动"
          value={jitter}
          min={0}
          max={0.03}
          step={0.001}
          unit=""
          onChange={onJitterChange}
          onCommit={(v) => persistDotTuningValue(componentId,"jitter", v)}
        />
        <TuningSlider
          label="边缘喷散"
          value={edgeSpray}
          min={0}
          max={0.12}
          step={0.002}
          unit=""
          onChange={onEdgeSprayChange}
          onCommit={(v) => persistDotTuningValue(componentId,"edgeSpray", v)}
        />
        <TuningSlider
          label="大小随机"
          value={sizeVariance}
          min={0}
          max={1}
          step={0.02}
          unit=""
          onChange={onSizeVarianceChange}
          onCommit={(v) => persistDotTuningValue(componentId,"sizeVariance", v)}
        />
      </div>
    </TuningPanelShell>
  );
}
