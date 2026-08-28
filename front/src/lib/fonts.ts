import { Geist, JetBrains_Mono, Noto_Sans_SC } from "next/font/google";

/**
 * 全站字体：
 * - 拉丁正文与标题用 Geist（替换掉原来的自托管 Inter，字形更利落、有辨识度）。
 * - 中文用 Noto Sans SC webfont，跨平台渲染统一，不再依赖系统苹方/雅黑回退。
 * - 等宽强调字体沿用 JetBrains Mono，用于小标签、编号等 ElevenLabs 风格细节。
 *
 * 三个都通过 CSS 变量注入（layout.tsx 挂在 <html> 上），字体栈在 globals.css
 * 的 --font-sans 里按 Geist → Noto Sans SC → system-ui 顺序回退。
 */
export const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
});

export const notoSansSC = Noto_Sans_SC({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  // Noto Sans SC 体积大且 Google Fonts 不暴露可声明的中文子集，关掉预加载，
  // 交给浏览器按 unicode-range 现取。
  preload: false,
  variable: "--font-noto-sans-sc",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
