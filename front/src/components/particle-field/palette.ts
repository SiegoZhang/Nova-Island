// 默认配色与取色函数已经收进 lib/dotSystem（DEFAULT_FIELD_COLORS 现在跟
// 球体/疏密点阵的颜色渐变数据放在同一份 tokens.ts 里维护），这里保留原有
// 导出名做薄转发。
export { DEFAULT_FIELD_COLORS } from "@/lib/dotSystem/tokens";
export { colorForT, rgba } from "@/lib/dotSystem/colorRamp";
