import { JetBrains_Mono } from "next/font/google";

/**
 * 「新岛」市场页（首页 / AI社群 / FDE / 联系我们）的等宽强调字体，
 * 用于小标签、编号等 ElevenLabs 风格的细节排版。正文与标题沿用全局 Inter。
 */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
