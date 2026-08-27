"use client";

import { useEffect, useRef, useState } from "react";

interface LazyMountProps {
  children: React.ReactNode;
  /** 提前挂载的视口余量（IntersectionObserver rootMargin，纯数字 px）。 */
  marginPx?: number;
  className?: string;
}

// 首页 AI 社群卡片轮播一次性常驻挂载了六个独立的"视频转点阵"视觉组件
// （RingSphereDotMatrix/SalonDotMatrix/ToolDotMatrix/…），每个内部都会
// 建一个 WebGL 场景 + 一个 autoplay 的 <video>。这些卡片在首屏加载时其实
// 都还在折叠线以下，但因为不受任何视口条件控制，会跟 Hero 自己的视频
// 点阵挤在同一时间抢占浏览器的视频解码/网络调度资源——实测过，禁用这
// 一整块轮播后，Hero 视频的 loadedmetadata 时间从约 1.7~4 秒降到
// 0.6~1 秒左右，就是被这几个远在视口外的实例拖慢的。
//
// 这里不改六个视觉组件内部实现（各自都近千行、对应各自视频素材精细调过
// 参，改动风险高），只在渲染它们的地方套一层"滚到附近才真正 mount"：
// 用 IntersectionObserver 判断，不在 effect 里手动同步调 setState 判断
// "已经可见"这种分支——IntersectionObserver 自己 observe() 之后就会异步
// 触发一次初始回调、报告当前是否已经相交，不需要在它之外另外手动算一次
// getBoundingClientRect，两套判断逻辑也不会互相打架。
export function LazyMount({ children, marginPx = 400, className }: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          setShouldRender(true);
        }
      },
      { rootMargin: `${marginPx}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldRender, marginPx]);

  return (
    <div ref={ref} className={className ?? "size-full"}>
      {shouldRender ? children : null}
    </div>
  );
}
