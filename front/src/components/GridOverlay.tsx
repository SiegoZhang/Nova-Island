// Figma node 217:14「grid-overlay」：铺满板块背景的 100px 浅色网格。
// Figma 原始描边是 white / opacity 0.0196——在真实屏幕上几乎不可见，这里
// 提到 ~0.07 让它成为「看得见但不抢戏」的底纹。整层 pointer-events-none、
// 绝对定位铺满父级（父级需要 position: relative），放在内容层下面。
export function GridOverlay({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
        backgroundSize: "100px 100px",
        // 让网格从容器左上角起画，切屏时不会因为背景默认定位跳动。
        backgroundPosition: "0 0",
      }}
    />
  );
}
