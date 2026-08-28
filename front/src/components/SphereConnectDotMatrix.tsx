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

// 「同频集会」的视觉——跟 FlagVisual/ToolDotMatrix 同一套实现逻辑：单层
// 点阵，驱动源是循环视频（assets/小球连接.mp4，AI 生成，发光小球之间用触须
// 相连、彼此靠近汇聚）。
//
// 跟旗帜/工具视频不同的一点：这支视频背景不是纯黑，而是深蓝紫色的渐变
// （实测四角/中点 luminance 大约在 0.01~0.25 之间浮动，不是单一数值），
// 亮度阈值要相应调高、软化区间收窄，才能把背景和小球本体的高光分开——
// 阈值/柔化默认值比旗帜/工具更保守，就是为了这个。

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

    // 主色调：按亮度在两档灰（uColorLow→uColorGlow）之间插值，形成点阵纹理。
    float lum = clamp(vLuminance, 0.0, 1.0);
    vec3 color = mix(uColorLow, uColorGlow, lum);
    // 少量高光：仅亮度最高的一小段染成高光色 uColorHigh。
    color = mix(color, uColorHigh, smoothstep(0.72, 0.95, lum));
    float alpha = circle * vMask * uMaxAlpha;
    gl_FragColor = vec4(color, alpha);
  }
`;

interface SphereConnectDotCoreProps {
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

function SphereConnectDotCore({
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
}: SphereConnectDotCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
    videoRef.current = video;

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
      if (videoRef.current === video) videoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, gridCols, gridRows]);

  useEffect(() => {
    dotMinBaseRef.current = dotMinSize;
    dotMaxBaseRef.current = dotMaxSize;
    const material = materialRef.current;
    if (material) {
      const sizeScale = sizeScaleRef.current;
      material.uniforms.uDotMin.value = dotMinSize * sizeScale;
      material.uniforms.uDotMax.value = dotMaxSize * sizeScale;
      material.uniforms.uThreshold.value = opacityThreshold;
      material.uniforms.uSoftness.value = softness;
      material.uniforms.uContrast.value = contrast;
      (material.uniforms.uColorLow.value as THREE.Color).set(colorLow);
      (material.uniforms.uColorHigh.value as THREE.Color).set(colorHigh);
      material.uniforms.uMaxAlpha.value = maxAlpha;
      material.uniforms.uPointerRadius.value = pointerRadius;
      material.uniforms.uPointerAttract.value = pointerAttract;
      material.uniforms.uPointerSizeBoost.value = pointerSizeBoost;
      }
    if (videoRef.current) {
      videoRef.current.playbackRate = Math.min(4, Math.max(0.1, speed));
    }
  }, [
    dotMinSize,
    dotMaxSize,
    opacityThreshold,
    softness,
    contrast,
    colorLow,
    colorHigh,
    maxAlpha,
    speed,
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

const SPHERE_CONNECT_VIDEO_SRC = "/videos/spheres.mp4";

const DEFAULT_GRID_COLS = 74;
const DEFAULT_GRID_ROWS = 60;

const SPHERE_CONNECT_DEFAULTS = {
  density: 1.5,
  dotMaxSize: 4.8,
  dotMinSize: 0,
  // 背景是深蓝紫渐变、不是纯黑，阈值/柔化都要比旗帜/工具（纯黑底）更高更
  // 窄，才能把背景压下去、只留小球本体的高光——见文件头部注释。
  opacityThreshold: 0.23,
  softness: 0.02,
  contrast: 1.95,
  edgeFadeStart: 0.5,
  // 「同频集会」整支视频只用紫、黄两色：暗部紫、亮部黄，不加第三个高光色。
  colorLow: "#d0d0d0",
  colorHigh: "#ffffff",
  colorGlow: "#e8e8e8",
  background: "#fdfcfc",
  maxAlpha: 1,
  // 原速播放小球飘动/汇聚的节奏偏快，调慢到 0.6x 更符合「同频集会」想传
  // 达的沉稳、从容的连接感。
  speed: 0.6,
  blurPx: 0,
  rightShiftPercent: 33,
  downShiftPercent: 0,
  /** 整体缩放——跟 RingSphereDotMatrix 的 sizePercent 同一套做法，靠 CSS
   *  transform: scale() 实现，不改网格密度/点径，纯粹放大缩小视觉主体。 */
  sizePercent: 103,
  /** 鼠标影响半径，跟顶点局部坐标系同单位（-0.5~0.5）。 */
  pointerRadius: 0.16,
  /** 鼠标"吸附"力度——半径内的点朝鼠标位置额外偏移的比例。 */
  pointerAttract: 0.35,
  /** 鼠标悬浮处的点在原本亮度决定的大小基础上再叠加的放大倍数。 */
  pointerSizeBoost: 1.2,
} as const;

export interface SphereConnectDotMatrixProps {
  className?: string;
  background?: string;
}

export function SphereConnectDotMatrix({
  className,
  background = SPHERE_CONNECT_DEFAULTS.background,
}: SphereConnectDotMatrixProps) {
  const [density, setDensity] = useState<number>(SPHERE_CONNECT_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(SPHERE_CONNECT_DEFAULTS.dotMaxSize);
  const [opacityThreshold, setOpacityThreshold] = useState<number>(
    SPHERE_CONNECT_DEFAULTS.opacityThreshold,
  );
  const [softness, setSoftness] = useState<number>(SPHERE_CONNECT_DEFAULTS.softness);
  const [contrast, setContrast] = useState<number>(SPHERE_CONNECT_DEFAULTS.contrast);
  const [colorLow, setColorLow] = useState<string>(SPHERE_CONNECT_DEFAULTS.colorLow);
  const [colorHigh, setColorHigh] = useState<string>(SPHERE_CONNECT_DEFAULTS.colorHigh);
  const [blurPx, setBlurPx] = useState<number>(SPHERE_CONNECT_DEFAULTS.blurPx);
  const [rightShiftPercent, setRightShiftPercent] = useState<number>(
    SPHERE_CONNECT_DEFAULTS.rightShiftPercent,
  );
  const [downShiftPercent, setDownShiftPercent] = useState<number>(
    SPHERE_CONNECT_DEFAULTS.downShiftPercent,
  );
  const [sizePercent, setSizePercent] = useState<number>(SPHERE_CONNECT_DEFAULTS.sizePercent);
  const [speed, setSpeed] = useState<number>(SPHERE_CONNECT_DEFAULTS.speed);
  const [pointerRadius, setPointerRadius] = useState<number>(
    SPHERE_CONNECT_DEFAULTS.pointerRadius,
  );
  const [pointerAttract, setPointerAttract] = useState<number>(
    SPHERE_CONNECT_DEFAULTS.pointerAttract,
  );
  const [pointerSizeBoost, setPointerSizeBoost] = useState<number>(
    SPHERE_CONNECT_DEFAULTS.pointerSizeBoost,
  );

  const effectiveCols = Math.max(4, Math.round(DEFAULT_GRID_COLS * density));
  const effectiveRows = Math.max(4, Math.round(DEFAULT_GRID_ROWS * density));

  const sharedProps = {
    src: SPHERE_CONNECT_VIDEO_SRC,
    gridCols: effectiveCols,
    gridRows: effectiveRows,
    dotMaxSize,
    dotMinSize: SPHERE_CONNECT_DEFAULTS.dotMinSize,
    opacityThreshold,
    softness,
    contrast,
    edgeFadeStart: SPHERE_CONNECT_DEFAULTS.edgeFadeStart,
    colorLow,
    colorHigh,
    colorGlow: SPHERE_CONNECT_DEFAULTS.colorGlow,
    background,
    maxAlpha: SPHERE_CONNECT_DEFAULTS.maxAlpha,
    speed,
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
        <SphereConnectDotCore {...sharedProps} />
      </div>

      {process.env.NODE_ENV !== "production" && (
        <SphereConnectTuningPanel
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
          speed={speed}
          onSpeedChange={setSpeed}
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

function SphereConnectTuningPanel({
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
  speed,
  onSpeedChange,
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
  speed: number;
  onSpeedChange: (value: number) => void;
  pointerRadius: number;
  onPointerRadiusChange: (value: number) => void;
  pointerAttract: number;
  onPointerAttractChange: (value: number) => void;
  pointerSizeBoost: number;
  onPointerSizeBoostChange: (value: number) => void;
}) {
  return (
    <TuningPanelShell title="同频集会点阵调参（仅开发环境可见）">
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
            persistDotTuningValue("sphereConnect", "density", v);
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
          onCommit={(v) => persistDotTuningValue("sphereConnect", "dotMaxSize", v)}
        />
        <TuningSlider
          label="右移"
          value={rightShiftPercent}
          min={-20}
          max={40}
          step={1}
          unit="%"
          onChange={onRightShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "rightShiftPercent", v)}
        />
        <TuningSlider
          label="下移"
          value={downShiftPercent}
          min={-40}
          max={40}
          step={1}
          unit="%"
          onChange={onDownShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "downShiftPercent", v)}
        />
        <TuningSlider
          label="大小"
          value={sizePercent}
          min={40}
          max={240}
          step={1}
          unit="%"
          onChange={onSizePercentChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "sizePercent", v)}
        />
        <TuningSlider
          label="速度"
          value={speed}
          min={0.1}
          max={4}
          step={0.1}
          unit="×"
          onChange={onSpeedChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "speed", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">亮度（暗底抠像）</p>
        <TuningSlider
          label="阈值"
          value={opacityThreshold}
          min={0}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onOpacityThresholdChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "opacityThreshold", v)}
        />
        <TuningSlider
          label="柔化"
          value={softness}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onSoftnessChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "softness", v)}
        />
        <TuningSlider
          label="对比度"
          value={contrast}
          min={0.5}
          max={2.5}
          step={0.05}
          unit=""
          onChange={onContrastChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "contrast", v)}
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
          onCommit={(v) => persistDotTuningValue("sphereConnect", "blurPx", v)}
        />
        <CommitColorPicker
          label="暗部"
          value={colorLow}
          onCommit={(v) => {
            onColorLowChange(v);
            persistDotTuningValue("sphereConnect", "colorLow", v);
          }}
        />
        <CommitColorPicker
          label="亮部"
          value={colorHigh}
          onCommit={(v) => {
            onColorHighChange(v);
            persistDotTuningValue("sphereConnect", "colorHigh", v);
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
          onCommit={(v) => persistDotTuningValue("sphereConnect", "pointerRadius", v)}
        />
        <TuningSlider
          label="吸附力"
          value={pointerAttract}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={onPointerAttractChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "pointerAttract", v)}
        />
        <TuningSlider
          label="放大"
          value={pointerSizeBoost}
          min={0}
          max={3}
          step={0.05}
          unit="×"
          onChange={onPointerSizeBoostChange}
          onCommit={(v) => persistDotTuningValue("sphereConnect", "pointerSizeBoost", v)}
        />
      </div>
    </TuningPanelShell>
  );
}
