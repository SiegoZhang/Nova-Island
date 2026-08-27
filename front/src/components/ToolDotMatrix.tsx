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

// 「工具教程」的视觉——驱动源是循环视频（assets/工具视频.mp4，AI 生成，
// 蓝银色齿轮/轴承分解组装的产品级 3D 渲染），纯黑背景，跟 FlagVisual/
// NavigatorDotMatrix 一样靠亮度阈值就能干净抠像。仍然沿用色键分支（跟
// RingSphereDotMatrix 同一套实现）而不是拆掉换成纯亮度阈值，是因为色键
// 目标色设成黑色时数学上退化成跟亮度阈值等价的效果，同时保留了调参面板
// 里色键相关的滑块，后续如果换回非纯黑背景的素材不需要再改代码。

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

interface ToolDotCoreProps {
  src: string;
  gridCols: number;
  gridRows: number;
  dotMaxSize: number;
  dotMinSize: number;
  opacityThreshold: number;
  softness: number;
  contrast: number;
  keyColor: string;
  keyThreshold: number;
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

function ToolDotCore({
  src,
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
}: ToolDotCoreProps) {
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

      // 固定按视频高度对齐卡片高度（取视频全高，不裁）。宽度方向：视频
      // 够宽就按容器比例裁掉多余部分贴满；芯片这支竖版素材宽度不够，就
      // 整段用上、两侧露出卡片底色，而不是反过来裁掉高度内容。
      const neededSourceWidth = vh * containerAspect;
      let sx = 0;
      let sw = vw;
      let destX = 0;
      let destW = gridCols;
      if (neededSourceWidth <= vw) {
        sw = neededSourceWidth;
        sx = (vw - sw) / 2;
      } else {
        destW = gridCols * (vw / neededSourceWidth);
        destX = (gridCols - destW) / 2;
      }

      sampleCtx.clearRect(0, 0, gridCols, gridRows);
      sampleCtx.drawImage(video, sx, 0, sw, vh, destX, 0, destW, gridRows);
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
    // pointer-events:none 去掉了——鼠标悬浮吸附效果需要收到
    // pointermove。这层没有自己的 onClick，事件照样冒泡到外层卡片的
    // onClick；「探索详情」按钮在更高的 z-10 层，命中测试轮不到这一层。
    <div ref={containerRef} aria-hidden="true" className="size-full" />
  );
}

// ---- 默认参数 + 外层调参面板 --------------------------------------------

const TOOL_VIDEO_SRC = "/videos/tool.mp4";

const DEFAULT_GRID_COLS = 74;
const DEFAULT_GRID_ROWS = 60;

const TOOL_DEFAULTS = {
  density: 1.7,
  dotMaxSize: 7.9,
  dotMinSize: 0,
  // 亮度阈值/柔化只用来在色键已经判定为"前景"的区域里做细节层次，不承担
  // 主要的抠像职责（跟 RingSphereDotMatrix 同一个思路），所以定得很低。
  opacityThreshold: 0,
  softness: 0.02,
  contrast: 0.5,
  // 工具视频是纯黑背景 + 蓝银色金属质感，色键目标改成黑色。
  keyColor: "#000000",
  keyThreshold: 0.02,
  keySoftness: 0.02,
  edgeFadeStart: 0.5,
  // 深藏青到冰蓝白，取自素材实测采样（暗部钢蓝 #2d3e69、亮部高光
  // 接近纯白），贴合齿轮组本身的蓝银金属色，而不是沿用旧芯片素材的
  // 薄荷绿。
  colorLow: "#d4b6fe",
  colorHigh: "#e1ed63",
  colorGlow: "#d4b6ff",
  background: "#fdfcfc",
  maxAlpha: 1,
  speed: 1,
  blurPx: 0,
  rightShiftPercent: 25,
  /** 整体向下偏移的比例（容器高度的百分比），跟右移是独立的两个轴，同样
   *  靠 CSS transform 平移实现。 */
  downShiftPercent: 2,
  /** 整体缩放——跟 RingSphereDotMatrix 的 sizePercent 同一套做法，靠 CSS
   *  transform: scale() 实现，不改网格密度/点径，纯粹放大缩小视觉主体。 */
  sizePercent: 51,
  /** 鼠标影响半径，跟顶点局部坐标系同单位（-0.5~0.5）。 */
  pointerRadius: 0.15,
  /** 鼠标"吸附"力度——半径内的点朝鼠标位置额外偏移的比例。 */
  pointerAttract: 0.62,
  /** 鼠标悬浮处的点在原本亮度决定的大小基础上再叠加的放大倍数。 */
  pointerSizeBoost: 1.35,
} as const;

export interface ToolDotMatrixProps {
  className?: string;
  background?: string;
}

export function ToolDotMatrix({ className, background = TOOL_DEFAULTS.background }: ToolDotMatrixProps) {
  const [density, setDensity] = useState<number>(TOOL_DEFAULTS.density);
  const [dotMaxSize, setDotMaxSize] = useState<number>(TOOL_DEFAULTS.dotMaxSize);
  const [opacityThreshold, setOpacityThreshold] = useState<number>(TOOL_DEFAULTS.opacityThreshold);
  const [softness, setSoftness] = useState<number>(TOOL_DEFAULTS.softness);
  const [contrast, setContrast] = useState<number>(TOOL_DEFAULTS.contrast);
  const [keyColor, setKeyColor] = useState<string>(TOOL_DEFAULTS.keyColor);
  const [keyThreshold, setKeyThreshold] = useState<number>(TOOL_DEFAULTS.keyThreshold);
  const [keySoftness, setKeySoftness] = useState<number>(TOOL_DEFAULTS.keySoftness);
  const [colorLow, setColorLow] = useState<string>(TOOL_DEFAULTS.colorLow);
  const [colorHigh, setColorHigh] = useState<string>(TOOL_DEFAULTS.colorHigh);
  const [blurPx, setBlurPx] = useState<number>(TOOL_DEFAULTS.blurPx);
  const [rightShiftPercent, setRightShiftPercent] = useState<number>(
    TOOL_DEFAULTS.rightShiftPercent,
  );
  const [downShiftPercent, setDownShiftPercent] = useState<number>(
    TOOL_DEFAULTS.downShiftPercent,
  );
  const [sizePercent, setSizePercent] = useState<number>(TOOL_DEFAULTS.sizePercent);
  const [pointerRadius, setPointerRadius] = useState<number>(TOOL_DEFAULTS.pointerRadius);
  const [pointerAttract, setPointerAttract] = useState<number>(TOOL_DEFAULTS.pointerAttract);
  const [pointerSizeBoost, setPointerSizeBoost] = useState<number>(
    TOOL_DEFAULTS.pointerSizeBoost,
  );

  const effectiveCols = Math.max(4, Math.round(DEFAULT_GRID_COLS * density));
  const effectiveRows = Math.max(4, Math.round(DEFAULT_GRID_ROWS * density));

  const sharedProps = {
    src: TOOL_VIDEO_SRC,
    gridCols: effectiveCols,
    gridRows: effectiveRows,
    dotMaxSize,
    dotMinSize: TOOL_DEFAULTS.dotMinSize,
    opacityThreshold,
    softness,
    contrast,
    keyColor,
    keyThreshold,
    keySoftness,
    edgeFadeStart: TOOL_DEFAULTS.edgeFadeStart,
    colorLow,
    colorHigh,
    colorGlow: TOOL_DEFAULTS.colorGlow,
    background,
    maxAlpha: TOOL_DEFAULTS.maxAlpha,
    speed: TOOL_DEFAULTS.speed,
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
        <ToolDotCore {...sharedProps} />
      </div>

      {process.env.NODE_ENV !== "production" && (
        <ToolTuningPanel
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

function ToolTuningPanel({
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
    <TuningPanelShell title="工具点阵调参（仅开发环境可见）">
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
            persistDotTuningValue("tool", "density", v);
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
          onCommit={(v) => persistDotTuningValue("tool", "dotMaxSize", v)}
        />
        <TuningSlider
          label="右移"
          value={rightShiftPercent}
          min={-20}
          max={40}
          step={1}
          unit="%"
          onChange={onRightShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("tool", "rightShiftPercent", v)}
        />
        <TuningSlider
          label="下移"
          value={downShiftPercent}
          min={-40}
          max={40}
          step={1}
          unit="%"
          onChange={onDownShiftPercentChange}
          onCommit={(v) => persistDotTuningValue("tool", "downShiftPercent", v)}
        />
        <TuningSlider
          label="大小"
          value={sizePercent}
          min={40}
          max={240}
          step={1}
          unit="%"
          onChange={onSizePercentChange}
          onCommit={(v) => persistDotTuningValue("tool", "sizePercent", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">抠像（色键）</p>
        <CommitColorPicker
          label="背景色"
          value={keyColor}
          onCommit={(v) => {
            onKeyColorChange(v);
            persistDotTuningValue("tool", "keyColor", v);
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
          onCommit={(v) => persistDotTuningValue("tool", "keyThreshold", v)}
        />
        <TuningSlider
          label="羽化"
          value={keySoftness}
          min={0.02}
          max={0.5}
          step={0.01}
          unit=""
          onChange={onKeySoftnessChange}
          onCommit={(v) => persistDotTuningValue("tool", "keySoftness", v)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <p className="text-[11px] font-medium text-[#1c1917]">亮度（内部层次）</p>
        <TuningSlider
          label="阈值"
          value={opacityThreshold}
          min={0}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onOpacityThresholdChange}
          onCommit={(v) => persistDotTuningValue("tool", "opacityThreshold", v)}
        />
        <TuningSlider
          label="柔化"
          value={softness}
          min={0.02}
          max={0.6}
          step={0.01}
          unit=""
          onChange={onSoftnessChange}
          onCommit={(v) => persistDotTuningValue("tool", "softness", v)}
        />
        <TuningSlider
          label="对比度"
          value={contrast}
          min={0.5}
          max={2.5}
          step={0.05}
          unit=""
          onChange={onContrastChange}
          onCommit={(v) => persistDotTuningValue("tool", "contrast", v)}
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
          onCommit={(v) => persistDotTuningValue("tool", "blurPx", v)}
        />
        <CommitColorPicker
          label="暗部"
          value={colorLow}
          onCommit={(v) => {
            onColorLowChange(v);
            persistDotTuningValue("tool", "colorLow", v);
          }}
        />
        <CommitColorPicker
          label="亮部"
          value={colorHigh}
          onCommit={(v) => {
            onColorHighChange(v);
            persistDotTuningValue("tool", "colorHigh", v);
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
          onCommit={(v) => persistDotTuningValue("tool", "pointerRadius", v)}
        />
        <TuningSlider
          label="吸附力"
          value={pointerAttract}
          min={0}
          max={1}
          step={0.01}
          unit=""
          onChange={onPointerAttractChange}
          onCommit={(v) => persistDotTuningValue("tool", "pointerAttract", v)}
        />
        <TuningSlider
          label="放大"
          value={pointerSizeBoost}
          min={0}
          max={3}
          step={0.05}
          unit="×"
          onChange={onPointerSizeBoostChange}
          onCommit={(v) => persistDotTuningValue("tool", "pointerSizeBoost", v)}
        />
      </div>
    </TuningPanelShell>
  );
}
