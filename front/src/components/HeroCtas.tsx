interface HeroCtasProps {
  /** Hero 处于黑底状态时，按钮配色要反转成浅色系。 */
  light?: boolean;
  /** 叠在球体等有纹理的背景上时，加一层阴影把按钮从背景里"提"出来，
   *  次要按钮同时换成更实的玻璃底色，避免球体点阵从半透明底色透出来。 */
  elevated?: boolean;
  /** 覆盖默认的 reveal 入场延迟/时长（ms）。不传则沿用 reveal-delay-2
   *  的默认节奏；内联 style 优先级高于 class，传了就会盖过默认值。 */
  revealDelayMs?: number;
  revealDurationMs?: number;
}

export function HeroCtas({
  light = true,
  elevated = false,
  revealDelayMs,
  revealDurationMs,
}: HeroCtasProps) {
  return (
    <div
      className="reveal reveal-delay-2 mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center"
      style={{
        animationDelay: revealDelayMs !== undefined ? `${revealDelayMs}ms` : undefined,
        animationDuration: revealDurationMs !== undefined ? `${revealDurationMs}ms` : undefined,
      }}
    >
      <a
        href="/contact"
        className={`inline-flex items-center justify-center rounded-full px-7 py-3 text-[14px] font-semibold transition-transform duration-300 hover:-translate-y-0.5 ${
          light ? "bg-[#1c1917] text-white" : "bg-white text-black"
        } ${elevated ? "shadow-[0_16px_36px_rgba(15,23,42,0.22)]" : ""}`}
      >
        联系我们
      </a>
      <a
        href="#about"
        className={`inline-flex items-center justify-center rounded-full border px-7 py-3 text-[14px] font-medium backdrop-blur-sm transition-colors duration-300 ${
          elevated
            ? "border-black/10 bg-white/85 text-[#1c1917] shadow-[0_10px_28px_rgba(15,23,42,0.14)] hover:bg-white/95"
            : light
              ? "border-black/15 bg-black/[0.03] text-[#1c1917] hover:border-black/30 hover:bg-black/[0.06]"
              : "border-white/25 bg-white/[0.04] text-white hover:border-white/50 hover:bg-white/[0.1]"
        }`}
      >
        了解更多
      </a>
    </div>
  );
}
