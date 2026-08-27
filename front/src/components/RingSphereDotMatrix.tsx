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

// 「超级内容」用的环形球体视频（assets/环形球体.mp4）背景是一块几乎不带
// 噪点的纯色实心蓝（实测 rgb(0,105,232) 全画面统一），球体本身金色，明暗
// 跨度很大——阴影处的亮度甚至比蓝色背景还低。VideoDotMatrix 那套"纯亮度
// 阈值"在这种素材上行不通：阈值定高会把球体暗部一起裁掉、阈值定低背景蓝
// 又会跟着冒出来。这里换成色键抠像（跟摄影棚蓝幕抠像同一个原理）：算每个
// 采样点的颜色离背景蓝有多远，离得越远越可能是球体，跟亮度阈值一起相乘
// 做最终的点阵显隐 mask，球体内部的明暗仍然用亮度驱动点的颜色/大小渐变。

const VERTEX_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uPixelRatio;
  uniform float uDotMin;
  uniform float uDotMax;
  uniform float uThreshold;
  uniform float uSoftness;
  uniform float uContrast;
  uniform float uKeyColor_r;
  uniform float uKeyColor_g;
  uniform float uKeyColor_b;
  uniform float uKeyThreshold;
  uniform float uKeySoftness;
  uniform float uFadeStart;
  uniform vec2 uPointer;
  uniform float uPointerRadius;
  uniform float uPointerActivity;
  uniform float uPointerAttract;
  uniform float uPointerSizeBoost;

  attribute vec2 aUv;

  varying float vLuminance;
  varying float vMask;

  void main() {
    vec3 texel = texture2D(uTexture, aUv).rgb;
    float luminance = dot(texel, vec3(0.299, 0.587, 0.114));
    luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

    vec3 keyColor = vec3(uKeyColor_r, uKeyColor_g, uKeyColor_b);
    float keyDist = length(texel - keyColor);
    float keyMask = smoothstep(uKeyThreshold, uKeyThreshold + uKeySoftness, keyDist);
    float lumMask = smoothstep(uThreshold, uThreshold + uSoftness, luminance);
    float mask = keyMask * lumMask;

    vec2 edge = abs(position.xy);
    float fadeX = 1.0 - smoothstep(uFadeStart, 0.5, edge.x);
    float fadeY = 1.0 - smoothstep(uFadeStart, 0.5, edge.y);
    mask *= fadeX * fadeY;

    vLuminance = luminance;
    vMask = mask;

    // 鼠标"吸附"：半径内已经可见的点朝鼠标位置轻微偏移 + 放大，营造被
    // 吸过去的感觉；uPointerActivity 是移入/移出时缓动出来的 0~1 强度，
    // 不是简单的开关，鼠标移开后会平滑收回而不是瞬间消失。
    vec2 toPointer = uPointer - position.xy;
    float pointerDist = length(toPointer);
    float pointerFalloff = 1.0 - smoothstep(0.0, uPointerRadius, pointerDist);
    float pointerGlow = pointerFalloff * uPointerActivity * step(0.003, mask);

    vec3 warpedPosition = position;
    warpedPosition.xy += toPointer * pointerGlow * uPointerAttract;

    vec4 mvPosition = modelViewMatrix * vec4(warpedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float size = mix(uDotMin, uDotMax, mask);
    size *= 1.0 + pointerGlow * uPointerSizeBoost;
    gl_PointSize = size * uPixelRatio;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform vec3 uColorGlow;
  uniform float uMaxAlpha;

  varying float vLuminance;
  varying float vMask;

  void main() {
    if (vMask < 0.003) discard;

    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    float circle = 1.0 - smoothstep(0.32, 0.5, dist);
    if (circle <= 0.0) discard;

    // 只按亮度在暗部色 / 亮部色两色之间插值，不再叠加第三个高光色。
    vec3 color = mix(uColorLow, uColorHigh, clamp(vLuminance, 0.0, 1.0));
    float alpha = circle * vMask * uMaxAlpha;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface RingSphereCoreProps {
  src: string;
  className?: string;
  gridCols: number;
  gridRows: number;
  dotMaxSize: number;
  dotMinSize: number;
  opacityThreshold: number;
  softness: number;
  contrast: number;
  /** 色键背景色（跟视频背景实测色一致，#0069e8） */
  keyColor: string;
  /** 采样颜色离背景色的距离超过这个值才判定为"是球体"，越小越容易把
   *  背景蓝边缘的过渡色也当成球体保留下来。 */
  keyThreshold: number;
  /** keyThreshold 到完全判定为球体之间的过渡宽度，越大边缘越柔和。 */
  keySoftness: number;
  edgeFadeStart: number;
  colorLow: string;
  colorHigh: string;
  colorGlow: string;
  background: string;
  maxAlpha: number;
  speed: number;
  transparentBackground?: boolean;
  pointerRadius: number;
  pointerAttract: number;
  pointerSizeBoost: number;
}

function RingSphereCore({
  src,
  className,
  gridCols,
  gridRows,
  dotMaxSize,
  dotMinSize,
  opacityThreshold,
  softness,
  contrast,
  keyColor,
  keyThreshold,
  keySoftness,
  edgeFadeStart,
  colorLow,
  colorHigh,
  colorGlow,
  background,
  maxAlpha,
  speed,
  transparentBackground = false,
  pointerRadius,
  pointerAttract,
  pointerSizeBoost,
}: RingSphereCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 调参面板里大部分滑块（点径/亮度阈值/色键阈值/颜色……）不该像
  // gridCols/gridRows 那样触发整段 effect 重跑（销毁重建 video + WebGL
  // 场景太重，拖动滑块会一直卡顿）。这两个 ref 把"当前场景的 material"
  // 和"resize() 算出来的 sizeScale"暴露给下面第二个 effect，让那些参数
  // 变化时只更新已存在的 uniform 值，不销毁重建任何东西。
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sizeScaleRef = useRef(1);
  // resize() 里重新计算 uDotMin/uDotMax 时必须读最新的点径设定，不能用挂载
  // 那一刻闭包住的 dotMinSize/dotMaxSize——否则容器 resize 时会把调参面板
  // 刚设置的新点径悄悄冲回旧值。这两个 ref 由下面第二个 effect 同步更新。
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

    const key = new THREE.Color(keyColor);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uPixelRatio: { value: 1 },
        uDotMin: { value: dotMinSize },
        uDotMax: { value: dotMaxSize },
        uThreshold: { value: opacityThreshold },
        uSoftness: { value: softness },
        uContrast: { value: contrast },
        uKeyColor_r: { value: key.r },
        uKeyColor_g: { value: key.g },
        uKeyColor_b: { value: key.b },
        uKeyThreshold: { value: keyThreshold },
        uKeySoftness: { value: keySoftness },
        uFadeStart: { value: Math.min(0.499, Math.max(0, edgeFadeStart)) },
        uColorLow: { value: new THREE.Color(colorLow) },
        uColorHigh: { value: new THREE.Color(colorHigh) },
        uColorGlow: { value: new THREE.Color(colorGlow) },
        uMaxAlpha: { value: maxAlpha },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uPointerRadius: { value: pointerRadius },
        uPointerActivity: { value: 0 },
        uPointerAttract: { value: pointerAttract },
        uPointerSizeBoost: { value: pointerSizeBoost },
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
        // 反复重试仍失败：保底把背景色画出来，别停在空白。
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
    // src/gridCols/gridRows 变化才需要销毁重建 video + WebGL 场景（网格点数
    // 变了，geometry 的顶点数量必须重新分配）。其余调参面板暴露的数值改由
    // 下面第二个 effect 直接更新已存在的 uniform，不经过这里。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, gridCols, gridRows]);

  // 轻量调参：不重建场景，只把最新数值写进已存在的 uniform——下一次 rAF
  // 渲染（视频本来就在连续播放触发重绘）就会用上新值，拖动滑块不会有
  // 卡顿/黑屏。
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
    material.uniforms.uKeyThreshold.value = keyThreshold;
    material.uniforms.uKeySoftness.value = keySoftness;
    const key = new THREE.Color(keyColor);
    material.uniforms.uKeyColor_r.value = key.r;
    material.uniforms.uKeyColor_g.value = key.g;
    material.uniforms.uKeyColor_b.value = key.b;
    (material.uniforms.uColorLow.value as THREE.Color).set(colorLow);
    (material.uniforms.uColorHigh.value as THREE.Color).set(colorHigh);
    material.uniforms.uMaxAlpha.value = maxAlpha;
    material.uniforms.uPointerRadius.value = pointerRadius;
    material.uniforms.uPointerAttract.value = pointerAttract;
    material.uniforms.uPointerSizeBoost.value = pointerSizeBoost;
  }, [
    dotMinSize,
    dotMaxSize,
    opacityThreshold,
    softness,
    contrast,
    keyColor,
    keyThreshold,
    keySoftness,
    colorLow,
    colorHigh,
    maxAlpha,
    pointerRadius,
    pointerAttract,
    pointerSizeBoost,
    ]);

  return (
    // 之前整层是 pointer-events:none（纯装饰，不拦截任何事件）——现在要
    // 靠鼠标悬浮位置驱动点阵的吸附效果，必须能收到 pointermove，所以
    // 去掉了 pointer-events:none。卡片自身的点击/CTA 不受影响：这层没有
    // 自己的 onClick，事件照样冒泡到外层卡片的 onClick；「探索详情」按钮
    // 那一层 z-10 更高，命中测试本来就轮不到这一层。
    <div ref={containerRef} aria-hidden="true" className={`size-full ${className ?? ""}`} />
  );
}

// ---- 默认参数 + 外层调参面板 --------------------------------------------

const RING_SPHERE_SRC = "/videos/ring-sphere.mp4";

// gridCols/gridRows 沿用 HeroSection 同一套"以 8px 目标点距反推格数"算法：
// 参考容器约 590×478（AI 社群卡片实测尺寸），round(590/8)=74、
// round(478/8)=60，dotMaxSize 取格距的 90%（8*0.9=7.2）——跟 Hero 是同一个
// 密度基准。
const DEFAULT_GRID_COLS = 74;
const DEFAULT_GRID_ROWS = 60;

const RING_SPHERE_DEFAULTS = {
  density: 2,
  dotMaxSize: 5.9,
  dotMinSize: 0,
  // 亮度阈值/柔化只用来在色键已经判定为"球体"的区域里做细节层次，不承担
  // 主要的抠像职责，所以定得很低、软化区间很宽——见文件头部注释。
  opacityThreshold: 0.05,
  softness: 0.02,
  contrast: 0.85,
  // 视频背景实测色 rgb(0,105,232)，几乎无噪点的纯色蓝——数值来自对
  // assets/环形球体.mp4 抽帧多点采样，四角与画面中点色值完全一致。
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
  /** 球体整体在容器里向右偏移的比例（容器宽度的百分比）——避开卡片左侧
   *  的文案区，不需要裁切视频本身，靠 CSS transform 平移已渲染好的点阵
   *  画布，超出卡片边界的部分被卡片自身的 overflow-hidden 裁掉。 */
  rightShiftPercent: 22,
  /** 球体整体向下偏移的比例（容器高度的百分比），跟右移是独立的两个轴，
   *  同样靠 CSS transform 平移实现。 */
  downShiftPercent: 0,
  /** 球体整体的缩放比例（1 = 铺满整个卡片）。球体视频源本身画面里球体
   *  几乎顶满整个取景框，边缘留白很少；旗帜视频源留白多得多，同样铺满
   *  卡片的情况下球体看起来比旗帜"大"很多。这里缩小到 0.75，让两张卡片
   *  里视觉主体的大小更接近——同样靠 CSS transform: scale() 实现，不改
   *  网格密度/点径，缩放和点阵化是两件独立的事。 */
  sizePercent: 66,
  /** 鼠标影响半径，跟顶点局部坐标系同单位（-0.5~0.5，容器对角线之外
   *  基本到头），不随容器实际像素尺寸变化。 */
  pointerRadius: 0.16,
  /** 鼠标"吸附"力度——半径内的点朝鼠标位置额外偏移的比例，0 就是完全
   *  不挪位置，只剩变大。 */
  pointerAttract: 0.35,
  /** 鼠标悬浮处的点在原本亮度决定的大小基础上再叠加的放大倍数。 */
  pointerSizeBoost: 1.2,
} as const;

export interface RingSphereDotMatrixProps {
  className?: string;
  /** 卡片自己的背景色——跟旧版 wave.mp4 用法一致，手风琴用 #fdfcfc、
   *  轮播卡片用 #f3f3f3，两处背景不同，点与点之间的空隙要透出各自的底色。 */
  background?: string;
}

export function RingSphereDotMatrix({
  className,
  background = RING_SPHERE_DEFAULTS.background,
}: RingSphereDotMatrixProps) {
  const [density, setDensity] = useState<number>(RING_SPHERE_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(RING_SPHERE_DEFAULTS.dotMaxSize);
  const [opacityThreshold, setOpacityThreshold] = useState<number>(
    RING_SPHERE_DEFAULTS.opacityThreshold,
  );
  const [softness, setSoftness] = useState<number>(RING_SPHERE_DEFAULTS.softness);
  const [contrast, setContrast] = useState<number>(RING_SPHERE_DEFAULTS.contrast);
  const [keyColor, setKeyColor] = useState<string>(RING_SPHERE_DEFAULTS.keyColor);
  const [keyThreshold, setKeyThreshold] = useState<number>(RING_SPHERE_DEFAULTS.keyThreshold);
  const [keySoftness, setKeySoftness] = useState<number>(RING_SPHERE_DEFAULTS.keySoftness);
  const [colorLow, setColorLow] = useState<string>(RING_SPHERE_DEFAULTS.colorLow);
  const [colorHigh, setColorHigh] = useState<string>(RING_SPHERE_DEFAULTS.colorHigh);
  const [rightShiftPercent, setRightShiftPercent] = useState<number>(
    RING_SPHERE_DEFAULTS.rightShiftPercent,
  );
  const [downShiftPercent, setDownShiftPercent] = useState<number>(
    RING_SPHERE_DEFAULTS.downShiftPercent,
  );
  const [sizePercent, setSizePercent] = useState<number>(RING_SPHERE_DEFAULTS.sizePercent);
  const [pointerRadius, setPointerRadius] = useState<number>(RING_SPHERE_DEFAULTS.pointerRadius);
  const [pointerAttract, setPointerAttract] = useState<number>(
    RING_SPHERE_DEFAULTS.pointerAttract,
  );
  const [pointerSizeBoost, setPointerSizeBoost] = useState<number>(
    RING_SPHERE_DEFAULTS.pointerSizeBoost,
  );

  const effectiveCols = Math.max(4, Math.round(DEFAULT_GRID_COLS * density));
  const effectiveRows = Math.max(4, Math.round(DEFAULT_GRID_ROWS * density));

  return (
    <div className={`relative size-full overflow-hidden ${className ?? ""}`}>
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${rightShiftPercent}%) translateY(${downShiftPercent}%) scale(${sizePercent / 100})`,
        }}
      >
        <RingSphereCore
          src={RING_SPHERE_SRC}
          gridCols={effectiveCols}
          gridRows={effectiveRows}
          dotMaxSize={dotMaxSize}
          dotMinSize={RING_SPHERE_DEFAULTS.dotMinSize}
          opacityThreshold={opacityThreshold}
          softness={softness}
          contrast={contrast}
          keyColor={keyColor}
          keyThreshold={keyThreshold}
          keySoftness={keySoftness}
          edgeFadeStart={RING_SPHERE_DEFAULTS.edgeFadeStart}
          colorLow={colorLow}
          colorHigh={colorHigh}
          colorGlow={RING_SPHERE_DEFAULTS.colorGlow}
          background={background}
          maxAlpha={RING_SPHERE_DEFAULTS.maxAlpha}
          speed={RING_SPHERE_DEFAULTS.speed}
          transparentBackground
          pointerRadius={pointerRadius}
          pointerAttract={pointerAttract}
          pointerSizeBoost={pointerSizeBoost}
        />
      </div>

      {process.env.NODE_ENV !== "production" && (
        <RingSphereTuningPanel
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
          keyColor={keyColor}
          onKeyColorChange={setKeyColor}
          keyThreshold={keyThreshold}
          onKeyThresholdChange={setKeyThreshold}
          keySoftness={keySoftness}
          onKeySoftnessChange={setKeySoftness}
          colorLow={colorLow}
          onColorLowChange={setColorLow}
          colorHigh={colorHigh}
          onColorHighChange={setColorHigh}
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
        />
      )}
    </div>
  );
}

// 仅开发环境渲染的调参面板，跟 HeroTuningPanel 是同一套模式：密度/颜色这
// 类重操作用 CommitSlider/CommitColorPicker（松手才提交，避免拖动过程中
// 反复销毁重建 WebGL 场景），其余轻量数值用 TuningSlider 实时绑定。
function RingSphereTuningPanel({
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
  keyColor,
  onKeyColorChange,
  keyThreshold,
  onKeyThresholdChange,
  keySoftness,
  onKeySoftnessChange,
  colorLow,
  onColorLowChange,
  colorHigh,
  onColorHighChange,
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
}: {
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
  keyColor: string;
  onKeyColorChange: (value: string) => void;
  keyThreshold: number;
  onKeyThresholdChange: (value: number) => void;
  keySoftness: number;
  onKeySoftnessChange: (value: number) => void;
  colorLow: string;
  onColorLowChange: (value: string) => void;
  colorHigh: string;
  onColorHighChange: (value: string) => void;
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
}) {
  return (
    <TuningPanelShell title="环形球体点阵调参（仅开发环境可见）">
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
            persistDotTuningValue("ringSphere", "density", v);
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
          onCommit={(v) => persistDotTuningValue("ringSphere", "dotMaxSize", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">抠像（色键）</p>
        <CommitColorPicker
          label="背景色"
          value={keyColor}
          onCommit={(v) => {
            onKeyColorChange(v);
            persistDotTuningValue("ringSphere", "keyColor", v);
          }}
        />
        <TuningSlider
          label="阈值"
          value={keyThreshold}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onKeyThresholdChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "keyThreshold", v)}
        />
        <TuningSlider
          label="羽化"
          value={keySoftness}
          min={0.02}
          max={0.5}
          step={0.01}
          unit=""
          onChange={onKeySoftnessChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "keySoftness", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">亮度（球体内部层次）</p>
        <TuningSlider
          label="阈值"
          value={opacityThreshold}
          min={0}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onOpacityThresholdChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "opacityThreshold", v)}
        />
        <TuningSlider
          label="柔化"
          value={softness}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onSoftnessChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "softness", v)}
        />
        <TuningSlider
          label="对比度"
          value={contrast}
          min={0.5}
          max={2.5}
          step={0.05}
          unit=""
          onChange={onContrastChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "contrast", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">颜色 / 位置</p>
        <CommitColorPicker
          label="暗部"
          value={colorLow}
          onCommit={(v) => {
            onColorLowChange(v);
            persistDotTuningValue("ringSphere", "colorLow", v);
          }}
        />
        <CommitColorPicker
          label="亮部"
          value={colorHigh}
          onCommit={(v) => {
            onColorHighChange(v);
            persistDotTuningValue("ringSphere", "colorHigh", v);
          }}
        />
        <TuningSlider
          label="右移"
          value={rightShiftPercent}
          min={-20}
          max={40}
          step={1}
          unit="%"
          onChange={onRightShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "rightShiftPercent", v)}
        />
        <TuningSlider
          label="下移"
          value={downShiftPercent}
          min={-40}
          max={40}
          step={1}
          unit="%"
          onChange={onDownShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "downShiftPercent", v)}
        />
        <TuningSlider
          label="大小"
          value={sizePercent}
          min={40}
          max={240}
          step={1}
          unit="%"
          onChange={onSizePercentChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "sizePercent", v)}
        />
      </div>

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
          onCommit={(v) => persistDotTuningValue("ringSphere", "pointerRadius", v)}
        />
        <TuningSlider
          label="吸附力"
          value={pointerAttract}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={onPointerAttractChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "pointerAttract", v)}
        />
        <TuningSlider
          label="放大"
          value={pointerSizeBoost}
          min={0}
          max={3}
          step={0.05}
          unit="×"
          onChange={onPointerSizeBoostChange}
          onCommit={(v) => persistDotTuningValue("ringSphere", "pointerSizeBoost", v)}
        />
      </div>
    </TuningPanelShell>
  );
}
