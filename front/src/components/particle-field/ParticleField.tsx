"use client";

import { useEffect, useRef } from "react";

import {
  createVisibilityLifecycle,
  getClampedDpr,
  prefersReducedMotion,
} from "@/lib/dotSystem/runtime";

import { assemblyMode } from "./assemblyMode";
import { breakawayMode } from "./breakawayMode";
import { convergenceMode } from "./convergenceMode";
import { flowMode } from "./flowMode";
import { gravityMode } from "./gravityMode";
import { DEFAULT_FIELD_COLORS } from "./palette";
import { resonanceMode } from "./resonanceMode";
import type { FieldColors, FieldConfig, FieldMode, PointerInput } from "./types";

// 生成式点阵视觉系统的统一入口：6 个维度各自一份 FieldMode
// （createState/update/draw），全部复用 imageSampledField 的采样算法。
const MODES = {
  resonance: resonanceMode,
  flow: flowMode,
  gravity: gravityMode,
  assembly: assemblyMode,
  convergence: convergenceMode,
  breakaway: breakawayMode,
} satisfies Record<string, FieldMode<unknown>>;

export type ParticleFieldMode = keyof typeof MODES;

export interface ParticleFieldProps {
  mode: ParticleFieldMode;
  className?: string;
  /** 核心节点数量，不同 mode 自行决定怎么用；resonance 用作共振节点数（3–5）。 */
  nodeCount?: number;
  interactive?: boolean;
  colors?: Partial<FieldColors>;
}

export function ParticleField({
  mode,
  className,
  nodeCount = 4,
  interactive = true,
  colors,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const controller = MODES[mode] as FieldMode<unknown>;
    const config: FieldConfig = {
      colors: { ...DEFAULT_FIELD_COLORS, ...colors },
      nodeCount,
      interactive,
      pointerRadius: 100,
    };

    const reduceMotion = prefersReducedMotion();
    const pointer: PointerInput = { x: -9999, y: -9999, active: false };

    let w = 0;
    let h = 0;
    let state: unknown = null;
    let raf = 0;
    let running = false;
    let lastTime = 0;
    let startTime = 0;
    let isVisible = true;

    function renderFrame() {
      if (!ctx || !state) return;
      controller.draw(ctx, state, w, h, config);
    }

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = getClampedDpr();
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = controller.createState(w, h, config);
      controller.update(state, 0, 0, pointer, config);
      renderFrame();
    }

    function frame(now: number) {
      if (!lastTime) lastTime = now;
      if (!startTime) startTime = now;
      const dt = Math.min(64, now - lastTime);
      lastTime = now;
      controller.update(state, dt, now - startTime, pointer, config);
      renderFrame();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduceMotion || !isVisible) return;
      running = true;
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function handlePointerMove(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    }

    function handlePointerLeave() {
      pointer.active = false;
    }

    resize();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);

    // isVisible 反映"当前是否应该播放"（离开视口 或 标签页切走都算不可见）。
    const disposeVisibilityLifecycle = createVisibilityLifecycle(canvas, {
      onVisible: () => {
        isVisible = true;
        start();
      },
      onHidden: () => {
        isVisible = false;
        stop();
      },
    });

    if (interactive && !reduceMotion) {
      canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
      canvas.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    }

    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      disposeVisibilityLifecycle();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
    // colors 只在挂载时读取一次，非受控 prop，不需要作为响应式依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nodeCount, interactive]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`block size-full ${className ?? ""}`}
    />
  );
}
