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

// 「每周风向」的视觉——单层点阵，驱动源是循环视频（assets/每日视频.mp4，
// AI 生成，一只发光蝴蝶振翅）。之前用的是旗帜视频（assets/旗帜视频.mp4），
// 换成蝴蝶素材后配色也从旗帜的蓝紫色系改成蝴蝶本身的暖橙黄色系，其余实现
// 逻辑不变。视频背景是纯黑（实测 rgb(0,0,0) 全画面统一），跟 Hero 的日出
// 视频、旧版 wave.mp4 一样，靠亮度阈值就能干净地把黑色背景裁掉——不需要
// RingSphereDotMatrix 那套色键抠像（那是给纯色蓝背景准备的，见
// RingSphereDotMatrix.tsx 头部注释）。

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

  attribute vec2 aUv;

  varying float vLuminance;
  varying float vMask;

  void main() {
    vec3 texel = texture2D(uTexture, aUv).rgb;
    float luminance = dot(texel, vec3(0.299, 0.587, 0.114));
    luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

    float mask = smoothstep(uThreshold, uThreshold + uSoftness, luminance);

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

interface FlagDotCoreProps {
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
  background: string;
  maxAlpha: number;
  speed: number;
  transparentBackground?: boolean;
  pointerRadius: number;
  pointerAttract: number;
  pointerSizeBoost: number;
}

function FlagDotCore({
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
  background,
  maxAlpha,
  speed,
  transparentBackground = false,
  pointerRadius,
  pointerAttract,
  pointerSizeBoost,
}: FlagDotCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 调参面板里大部分滑块（点径/亮度阈值/颜色……）不该像 gridCols/gridRows
  // 那样触发整段 effect 重跑（销毁重建 video + WebGL 场景太重，拖动滑块会
  // 一直卡顿）。这两个 ref 把"当前场景的 material"和"resize() 算出来的
  // sizeScale"暴露给下面第二个 effect，让那些参数变化时只更新已存在的
  // uniform 值，不销毁重建任何东西。
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
    // src/gridCols/gridRows 变化才需要销毁重建 video + WebGL 场景。其余调参
    // 面板暴露的数值改由下面第二个 effect 直接更新已存在的 uniform。
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
    (material.uniforms.uColorLow.value as THREE.Color).set(colorLow);
    (material.uniforms.uColorHigh.value as THREE.Color).set(colorHigh);
    (material.uniforms.uColorGlow.value as THREE.Color).set(colorGlow);
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
    colorLow,
    colorHigh,
    colorGlow,
    maxAlpha,
    pointerRadius,
    pointerAttract,
    pointerSizeBoost,
    ]);

  return (
    // pointer-events:none 去掉了——鼠标悬浮吸附效果需要收到
    // pointermove。这层没有自己的 onClick，事件照样冒泡到外层卡片的
    // onClick；「探索详情」按钮在更高的 z-10 层，命中测试轮不到这一层。
    <div ref={containerRef} aria-hidden="true" className="size-full" />
  );
}

// ---- 默认参数 + 外层调参面板 --------------------------------------------

const FLAG_VIDEO_SRC = "/videos/daily.mp4";

// gridCols/gridRows 沿用 HeroSection 同一套"以 8px 目标点距反推格数"算法：
// 参考容器约 590×478（AI 社群卡片实测尺寸），round(590/8)=74、
// round(478/8)=60，dotMaxSize 取格距的 90%（8*0.9=7.2）——跟 Hero 是同一个
// 密度基准，两层共用同一个 density 倍率，跟 HeroSection 默认的两层
// 1.25× 一致。
const DEFAULT_GRID_COLS = 74;
const DEFAULT_GRID_ROWS = 60;

const FLAG_DEFAULTS = {
  density: 2,
  dotMaxSize: 5.9,
  dotMinSize: 0,
  opacityThreshold: 0.05,
  softness: 0.02,
  contrast: 1.2,
  edgeFadeStart: 0.5,
  // 蝴蝶本身的暖橙黄配色（取自素材实测采样：暗部翅缘 #884519、亮部
  // #ffd529/#ffed35），不再沿用旗帜视频的蓝紫色系。
  colorLow: "#1a38ce",
  colorHigh: "#d4b6fe",
  colorGlow: "#d4b6ff",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  blurPx: 0,
  /** 视觉整体在容器里向右偏移的比例（容器宽度的百分比）——避开卡片左侧
   *  的文案区，不需要裁切视频本身，靠 CSS transform 平移已渲染好的点阵
   *  画布，超出卡片边界的部分被卡片自身的 overflow-hidden 裁掉。 */
  rightShiftPercent: 21,
  /** 视觉整体向下偏移的比例（容器高度的百分比），同样靠 CSS transform
   *  平移实现，跟右移是独立的两个轴。 */
  downShiftPercent: 0,
  /** 视觉整体的缩放比例（1 = 铺满整个卡片），跟 RingSphereDotMatrix 的
   *  sizePercent 同一套做法，靠 CSS transform: scale() 实现，不改网格
   *  密度/点径，缩放和点阵化是两件独立的事。 */
  sizePercent: 75,
  /** 鼠标影响半径，跟顶点局部坐标系同单位（-0.5~0.5）。 */
  pointerRadius: 0.16,
  /** 鼠标"吸附"力度——半径内的点朝鼠标位置额外偏移的比例。 */
  pointerAttract: 0.35,
  /** 鼠标悬浮处的点在原本亮度决定的大小基础上再叠加的放大倍数。 */
  pointerSizeBoost: 1.2,
} as const;

export interface FlagVisualProps {
  className?: string;
  /** 卡片自己的背景色——手风琴用 #fdfcfc、轮播卡片用 #f3f3f3，两处不同，
   *  点与点之间的空隙要透出各自的底色。 */
  background?: string;
}

export function FlagVisual({ className, background = FLAG_DEFAULTS.background }: FlagVisualProps) {
  const [density, setDensity] = useState<number>(FLAG_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(FLAG_DEFAULTS.dotMaxSize);
  const [opacityThreshold, setOpacityThreshold] = useState<number>(FLAG_DEFAULTS.opacityThreshold);
  const [softness, setSoftness] = useState<number>(FLAG_DEFAULTS.softness);
  const [contrast, setContrast] = useState<number>(FLAG_DEFAULTS.contrast);
  const [colorLow, setColorLow] = useState<string>(FLAG_DEFAULTS.colorLow);
  const [colorHigh, setColorHigh] = useState<string>(FLAG_DEFAULTS.colorHigh);
  const [blurPx, setBlurPx] = useState<number>(FLAG_DEFAULTS.blurPx);
  const [rightShiftPercent, setRightShiftPercent] = useState<number>(
    FLAG_DEFAULTS.rightShiftPercent,
  );
  const [downShiftPercent, setDownShiftPercent] = useState<number>(
    FLAG_DEFAULTS.downShiftPercent,
  );
  const [sizePercent, setSizePercent] = useState<number>(FLAG_DEFAULTS.sizePercent);
  const [pointerRadius, setPointerRadius] = useState<number>(FLAG_DEFAULTS.pointerRadius);
  const [pointerAttract, setPointerAttract] = useState<number>(FLAG_DEFAULTS.pointerAttract);
  const [pointerSizeBoost, setPointerSizeBoost] = useState<number>(
    FLAG_DEFAULTS.pointerSizeBoost,
  );

  const effectiveCols = Math.max(4, Math.round(DEFAULT_GRID_COLS * density));
  const effectiveRows = Math.max(4, Math.round(DEFAULT_GRID_ROWS * density));

  const sharedProps = {
    src: FLAG_VIDEO_SRC,
    gridCols: effectiveCols,
    gridRows: effectiveRows,
    dotMaxSize,
    dotMinSize: FLAG_DEFAULTS.dotMinSize,
    opacityThreshold,
    softness,
    contrast,
    edgeFadeStart: FLAG_DEFAULTS.edgeFadeStart,
    colorLow,
    colorHigh,
    colorGlow: FLAG_DEFAULTS.colorGlow,
    background,
    maxAlpha: FLAG_DEFAULTS.maxAlpha,
    speed: FLAG_DEFAULTS.speed,
    transparentBackground: true,
      pointerRadius,
    pointerAttract,
    pointerSizeBoost,
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
        <FlagDotCore {...sharedProps} />
      </div>

      {process.env.NODE_ENV !== "production" && (
        <FlagTuningPanel
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
        />
      )}
    </div>
  );
}

// 仅开发环境渲染的调参面板，跟 HeroTuningPanel / RingSphereTuningPanel 是
// 同一套模式：密度这类重操作用 CommitSlider（松手才提交，避免拖动过程中
// 反复销毁重建 WebGL 场景），其余轻量数值用 TuningSlider 实时绑定。
function FlagTuningPanel({
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
}) {
  return (
    <TuningPanelShell title="每周风向点阵调参（仅开发环境可见）">
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
            persistDotTuningValue("flag", "density", v);
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
          onCommit={(v) => persistDotTuningValue("flag", "dotMaxSize", v)}
        />
        <TuningSlider
          label="右移"
          value={rightShiftPercent}
          min={-20}
          max={40}
          step={1}
          unit="%"
          onChange={onRightShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("flag", "rightShiftPercent", v)}
        />
        <TuningSlider
          label="下移"
          value={downShiftPercent}
          min={-40}
          max={40}
          step={1}
          unit="%"
          onChange={onDownShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("flag", "downShiftPercent", v)}
        />
        <TuningSlider
          label="大小"
          value={sizePercent}
          min={40}
          max={240}
          step={1}
          unit="%"
          onChange={onSizePercentChange}
          onCommit={(v) => persistDotTuningValue("flag", "sizePercent", v)}
        />
      </div>

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
          onCommit={(v) => persistDotTuningValue("flag", "opacityThreshold", v)}
        />
        <TuningSlider
          label="柔化"
          value={softness}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onSoftnessChange}
          onCommit={(v) => persistDotTuningValue("flag", "softness", v)}
        />
        <TuningSlider
          label="对比度"
          value={contrast}
          min={0.5}
          max={2.5}
          step={0.05}
          unit=""
          onChange={onContrastChange}
          onCommit={(v) => persistDotTuningValue("flag", "contrast", v)}
        />
      </div>

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
          onCommit={(v) => persistDotTuningValue("flag", "blurPx", v)}
        />
        <CommitColorPicker
          label="暗部"
          value={colorLow}
          onCommit={(v) => {
            onColorLowChange(v);
            persistDotTuningValue("flag", "colorLow", v);
          }}
        />
        <CommitColorPicker
          label="亮部"
          value={colorHigh}
          onCommit={(v) => {
            onColorHighChange(v);
            persistDotTuningValue("flag", "colorHigh", v);
          }}
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
          onCommit={(v) => persistDotTuningValue("flag", "pointerRadius", v)}
        />
        <TuningSlider
          label="吸附力"
          value={pointerAttract}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={onPointerAttractChange}
          onCommit={(v) => persistDotTuningValue("flag", "pointerAttract", v)}
        />
        <TuningSlider
          label="放大"
          value={pointerSizeBoost}
          min={0}
          max={3}
          step={0.05}
          unit="×"
          onChange={onPointerSizeBoostChange}
          onCommit={(v) => persistDotTuningValue("flag", "pointerSizeBoost", v)}
        />
      </div>
    </TuningPanelShell>
  );
}
