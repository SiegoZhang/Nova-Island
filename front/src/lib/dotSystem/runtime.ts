import type { PointerTrailTuning } from "./types";

// 点阵 canvas 效果共用的运行时小工具。这些都不是 React hook——每个点阵
// 效果自己在一个大的 useEffect 里手写 resize/rAF 循环（不经过 React
// state/props 驱动重绘），这里只是把其中重复出现的几段逻辑收成可复用的
// 纯函数/小状态机，供那个 useEffect 内部调用。

/** 夹到 2 的 DPR——8 处组件里完全相同的一行，原样保留调用方式（在各自的
 * resize() 里调用），只是不用每个文件都写一遍。 */
export function getClampedDpr(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

// ── 视频加载：并发闸 + 容错重试 ────────────────────────────────────────
// 首页会同时挂载约十个"视频转点阵"效果，每个内部都建一个 <video> 拉一段
// mp4 并解码。浏览器对"同时在初始化解码 / 缓冲"的视频数量有隐性上限（移动
// 端尤其紧），一次性放十个进去，排在后面的（FDE 点阵地球、"继续了解新岛"
// CTA）会一直卡在等解码槽，loadeddata 迟迟不触发、点阵起不来，观感就是
// "视频加载不出来 / 不动了"。素材压缩后所有视频几乎同一瞬间就绪，这个竞争
// 反而更明显。
//
// manageVideoElement 用一个模块级令牌桶把"开始加载"串起来：任意时刻最多
// MAX_CONCURRENT_VIDEO_LOADS 个视频在走首帧加载；某个视频拿到首帧
// （loadeddata）或彻底失败后让出令牌，队列里下一个再开始。配套 error / 卡顿
// 超时 → 退避重试，最终失败回调交给调用方兜底（点阵保持背景色，不再永远
// 空白）。调用方原有的 IntersectionObserver 可见性判断、rAF 循环都不变，只是
// 把"设 src / 监听就绪 / play() / 清理"这几步交给这里统一管。

const MAX_CONCURRENT_VIDEO_LOADS = 3;
const VIDEO_LOAD_TIMEOUT_MS = 20000;
const VIDEO_LOAD_MAX_RETRIES = 2;

let activeVideoLoads = 0;
const pendingVideoLoads: Array<() => void> = [];

function acquireVideoLoadSlot(grant: () => void): void {
  if (activeVideoLoads < MAX_CONCURRENT_VIDEO_LOADS) {
    activeVideoLoads += 1;
    grant();
  } else {
    pendingVideoLoads.push(grant);
  }
}

function releaseVideoLoadSlot(): void {
  const next = pendingVideoLoads.shift();
  if (next) {
    // 令牌直接转交给下一个排队者，activeVideoLoads 计数不变。
    next();
  } else {
    activeVideoLoads = Math.max(0, activeVideoLoads - 1);
  }
}

export interface ManagedVideoHandle {
  /** 调用方判断"可见且该播"后调用；内部自带就绪判断，安全重复调用。 */
  play(): void;
  /** 暂停播放（保留已缓冲数据）。 */
  pause(): void;
  /**
   * 每帧在 rAF 循环里调一次。如果"应该在播"但视频实际是暂停/停住的
   * （自动播放被拒、被并发的 pause() 打断、切标签页回来、播放中途 decode
   * 或 range 请求报错等），就重新拉起播放——带节流，不会每帧真的调 play()。
   * 这是"卡在第一帧不动"的兜底：只要 rAF 还在跑，画面就能自己恢复。
   */
  tick(): void;
  /** useEffect cleanup 里调用：移除监听、释放令牌、断开 src。 */
  dispose(): void;
}

export interface ManageVideoOptions {
  src: string;
  /** 首帧就绪（可以开始采样 / 播放）时调用一次。 */
  onReady: () => void;
  /** 重试若干次仍加载失败时调用一次，调用方据此做兜底。 */
  onError?: () => void;
}

/** 给一个已创建好的 <video> 元素套上并发闸 + 容错。调用方不再自己设 src /
 *  监听 loadedmetadata / 调 video.play()，改为传 onReady 回调并用返回的
 *  handle 控制播放与清理。loop / muted / playsInline / preload 由这里统一设置，
 *  调用方仍可在传入前自行设置 playbackRate 等其它属性。 */
export function manageVideoElement(
  video: HTMLVideoElement,
  { src, onReady, onError }: ManageVideoOptions,
): ManagedVideoHandle {
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  // 关键：不设 autoplay。autoplay 会让浏览器无视并发上限，立刻抢资源缓冲
  // 整段视频——正是要避免的行为。播放时机完全由调用方通过 play() 控制。

  let disposed = false;
  let ready = false;
  let holdsSlot = false;
  let retries = 0;
  let timer = 0;
  let playWanted = false;
  let lastPlayAttempt = 0;
  let lastReloadAttempt = 0;

  function clearTimer(): void {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  }

  function releaseSlotIfHeld(): void {
    if (holdsSlot) {
      holdsSlot = false;
      releaseVideoLoadSlot();
    }
  }

  function tryPlay(): void {
    if (disposed || !ready || !playWanted) return;
    lastPlayAttempt = performance.now();
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  function handleReady(): void {
    if (disposed || ready) return;
    ready = true;
    clearTimer();
    releaseSlotIfHeld();
    onReady();
    tryPlay();
  }

  function handleFailure(): void {
    if (disposed || ready) return;
    clearTimer();
    releaseSlotIfHeld();
    if (retries < VIDEO_LOAD_MAX_RETRIES) {
      retries += 1;
      window.setTimeout(() => {
        if (!disposed && !ready) beginLoad();
      }, 600 * retries);
    } else {
      onError?.();
    }
  }

  function beginLoad(): void {
    if (disposed || ready) return;
    acquireVideoLoadSlot(() => {
      if (disposed || ready) {
        releaseVideoLoadSlot();
        return;
      }
      holdsSlot = true;
      clearTimer();
      timer = window.setTimeout(handleFailure, VIDEO_LOAD_TIMEOUT_MS);
      video.src = src;
      video.load();
    });
  }

  video.addEventListener("loadeddata", handleReady);
  video.addEventListener("error", handleFailure);

  beginLoad();

  return {
    play(): void {
      playWanted = true;
      tryPlay();
    },
    pause(): void {
      playWanted = false;
      video.pause();
    },
    tick(): void {
      if (disposed || !playWanted || !ready) return;
      const t = performance.now();
      // 播放中途报错（decode / range 请求失败）：元素进入 error 态，光靠
      // play() 拉不起来，得先 load() 重新走一遍。限频，避免抖动。
      if (video.error && t - lastReloadAttempt > 3000) {
        lastReloadAttempt = t;
        try {
          video.src = src;
          video.load();
        } catch {
          /* ignore */
        }
        return;
      }
      // 应该在播、却停住了：隔一小段时间重新 play()。覆盖自动播放被拒、
      // 被并发 pause() 打断、load() 重置、切标签页回来等所有情况。
      if (video.paused && !video.ended && video.readyState >= 2 && t - lastPlayAttempt > 500) {
        lastPlayAttempt = t;
        const p = video.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    },
    dispose(): void {
      disposed = true;
      clearTimer();
      releaseSlotIfHeld();
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("error", handleFailure);
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
  };
}

/** 用户是否开启了"减少动态效果"系统设置——只需要挂载时读一次（现有 6 处
 * 用法均如此，不监听后续变化）。 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface VisibilityLifecycleCallbacks {
  /** 元素进入视口且当前标签页可见时调用（可能被反复调用，需自行幂等）。 */
  onVisible: () => void;
  /** 元素离开视口或标签页被切走时调用（可能被反复调用，需自行幂等）。 */
  onHidden: () => void;
}

/** ResizeObserver 之外的"是否应该继续跑 rAF"生命周期：元素进入视口且标签页
 * 可见时 onVisible，否则 onHidden。原来 VideoDotMatrix 和
 * particle-field/ParticleField 里各写一份结构几乎相同的实现。
 * 返回值是清理函数，在组件的 useEffect cleanup 里调用。
 *
 * 可见性判断不直接用 IntersectionObserver 的 entry.isIntersecting / ratio——
 * 点阵容器普遍带 CSS transform: scale()/translate()（见各组件 sizePercent /
 * rightShiftPercent），又常嵌在 overflow 裁切的横向 scroll 容器（AI 社群轮播）
 * 里，IO 的 ratio 阈值在这些情况下会漏报"其实已经在屏幕上了"，导致视频迟迟
 * 不播、点阵卡在第一帧。这里改成：IO 只当"有变化，重新量一次"的触发器，真正
 * 的判断用 getBoundingClientRect 看容器矩形跟视口有没有交叠（哪怕 1px）。
 * 另外挂一个 ~500ms 的低频兜底轮询，覆盖 IO 完全没触发的边角情况（含 React
 * StrictMode 开发模式下 effect 双挂载的竞态），代价极小。 */
export function createVisibilityLifecycle(
  target: Element,
  callbacks: VisibilityLifecycleCallbacks,
): () => void {
  let disposed = false;

  function isOnScreen(): boolean {
    const r = target.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  function evaluate() {
    if (disposed) return;
    if (isOnScreen() && document.visibilityState !== "hidden") {
      callbacks.onVisible();
    } else {
      callbacks.onHidden();
    }
  }

  const intersectionObserver = new IntersectionObserver(() => evaluate(), {
    threshold: 0,
  });
  intersectionObserver.observe(target);

  document.addEventListener("visibilitychange", evaluate);
  const poll = window.setInterval(evaluate, 500);
  evaluate();

  return () => {
    disposed = true;
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", evaluate);
    window.clearInterval(poll);
  };
}

export interface PointerTrailPoint {
  x: number;
  y: number;
  t: number;
}

export interface PointerTrailController {
  points: PointerTrailPoint[];
  /** 记录一个新轨迹点——内部做最小移动距离节流 + 存活数量上限裁剪。
   * 返回是否真的记录了新点（未通过最小移动距离节流时返回 false，调用方
   * 可以据此决定要不要重新排 rAF 循环）。 */
  push(x: number, y: number): boolean;
  /** 清掉已过期的轨迹点，返回清理后是否还有存活的点（用来决定要不要继续排 rAF）。 */
  pruneExpired(now: number): boolean;
}

/** 鼠标拖尾状态机——原来在 HeroDotTexture.tsx（发光轨迹）和
 * HeroCosmosReveal.tsx（擦洞轨迹）里各写一份完全相同的 TrailPoint 数组 +
 * 最小移动节流 + 生命周期裁剪逻辑，只是画法（发光 vs 擦除）不同。这里只
 * 负责状态管理，具体怎么画仍由调用方自己在 pruneExpired 之后遍历
 * controller.points 决定。 */
export function createPointerTrail(tuning: PointerTrailTuning): PointerTrailController {
  const points: PointerTrailPoint[] = [];
  let lastPoint: { x: number; y: number } | null = null;

  return {
    points,
    push(x, y) {
      if (lastPoint) {
        const dx = x - lastPoint.x;
        const dy = y - lastPoint.y;
        if (dx * dx + dy * dy < tuning.minMove * tuning.minMove) return false;
      }
      lastPoint = { x, y };
      points.push({ x, y, t: performance.now() });
      if (points.length > tuning.maxPoints) {
        points.splice(0, points.length - tuning.maxPoints);
      }
      return true;
    },
    pruneExpired(now) {
      for (let i = points.length - 1; i >= 0; i--) {
        if (now - points[i].t >= tuning.lifetimeMs) points.splice(i, 1);
      }
      return points.length > 0;
    },
  };
}

export interface PointerHoverState {
  /** 归一化后的指针坐标，跟点阵顶点 position.xy 同一套 -0.5~0.5 局部坐标
   *  系（原点在容器中心，x 向右为正，y 向上为正）。 */
  x: number;
  y: number;
  /** 悬浮强度，0~1，每帧向目标值缓动一步，而不是移入/移出时瞬间切换。 */
  activity: number;
  /** 鼠标在容器内移动时调用——更新目标坐标，把目标强度设为 1。 */
  setActive(x: number, y: number): void;
  /** 鼠标移出容器时调用——目标强度归零，坐标留在最后位置，让高亮原地
   *  淡出而不是瞬间跳走。 */
  setInactive(): void;
  /** 每帧调用一次，把 activity 向目标强度缓动一步，返回缓动后的值。 */
  tick(): number;
}

/** 鼠标悬浮态的缓动状态机——AI 社群六张点阵卡片都要在鼠标经过时让附近的
 *  点"吸附"变大 + 变色高亮，各自会有一份"记录目标坐标/目标强度 + 每帧
 *  向目标缓动"的逻辑，抽成这个小状态机统一维护，用法上跟 createPointerTrail
 *  同一个模式（调用方自己在 rAF 循环里调 tick()，具体怎么喂进 shader
 *  uniform 由调用方决定）。 */
export function createPointerHoverState(ease = 0.18): PointerHoverState {
  let targetActive = 0;
  const state: PointerHoverState = {
    x: 0,
    y: 0,
    activity: 0,
    setActive(x, y) {
      state.x = x;
      state.y = y;
      targetActive = 1;
    },
    setInactive() {
      targetActive = 0;
    },
    tick() {
      state.activity += (targetActive - state.activity) * ease;
      if (Math.abs(targetActive - state.activity) < 0.001) state.activity = targetActive;
      return state.activity;
    },
  };
  return state;
}
