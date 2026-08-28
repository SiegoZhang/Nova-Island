import { jetbrainsMono } from "@/lib/fonts";

/**
 * 「新岛」视觉共享样式，参照 ElevenLabs（elevenlabs.io）设计规范：
 * 暖白/暖灰中性色板、Inter 大字号紧字距标题、JetBrains Mono 大写标签、
 * 发丝细边框、胶囊按钮。用于首页与 /ai、/fde、/contact 等市场页，
 * 以及全站共用的 Footer；社区页主体与导航暂未迁移，仍使用旧版 nova-* 样式。
 */

export const eColors = {
  canvas: "#fdfcfc",
  subtle: "#f5f3f1",
  line: "#efefef",
  ink: "#1c1917",
  body: "#57534e",
  muted: "#78716c",
  blue: "#2b7fff",
  red: "#fb2c36",
} as const;

// 与网格竖线对齐的内容列：竖线落在 max-w 边界，文字与竖线保持 36px 间距
export const eRailContainer = "mx-auto w-full max-w-[1280px]";
export const ePageContainer = `${eRailContainer} px-6 md:px-9`;

export const eBtnPrimary =
  "inline-flex items-center justify-center rounded-full bg-[#1A38CE] px-6 py-3 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[#1A38CE]/90 active:scale-[0.97]";

export const eBtnGhost =
  "inline-flex items-center justify-center rounded-full border border-[#efefef] bg-transparent px-6 py-3 text-[14px] font-medium tracking-[-0.01em] text-[#1c1917] transition-colors duration-200 hover:border-[#1c1917] active:scale-[0.97]";

export const eEyebrow = `inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-[#78716c] uppercase ${jetbrainsMono.className}`;

// 深色语境（首页整屏黑底）用的 eyebrow：字色提亮到中浅灰，其余排版与
// eEyebrow 完全一致。
export const eEyebrowDark = `inline-flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-[#8b8b8b] uppercase ${jetbrainsMono.className}`;

export const eMono = jetbrainsMono.className;

export const eFeatureItem =
  "flex items-center gap-3.5 border-t border-[#efefef] py-3.5 text-[14px] text-[#1c1917] transition-[padding] duration-200 last:border-b hover:pl-1.5";
