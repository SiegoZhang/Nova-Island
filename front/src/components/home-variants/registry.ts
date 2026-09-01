import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// ── 首页方案注册表 ──────────────────────────────────────────────
// 给老板出方案时，首页会有多套完全不同的设计。每套是 home-variants/ 下
// 一个独立文件（自带 Navbar / 布局 / 主题），彼此不共享布局逻辑，改一套
// 不影响另一套。
//
// 新增一套方案：
//   1. 在 home-variants/ 写 VariantXxx.tsx，默认导出一个组件；
//   2. 在下面的 VARIANTS 数组里加一行。
// 就这样，不用动 app/page.tsx、不用动路由。
//
// 切换机制：URL 查询参数 ?home=<id> 为准（可直接把链接发给老板），
// HomeVariantSwitcher 负责在页面角落切换 + localStorage 记住上次选择。
// 每套方案用 next/dynamic 按需加载：只有当前选中的那套会进入运行，
// 某一套内部报错也不会拖垮其它方案。

export interface HomeVariant {
  /** URL 参数值 & localStorage 键，稳定不要改 */
  id: string;
  /** 切换器里显示的名字 */
  label: string;
  /** 切换器里的一句话说明 */
  description: string;
  Component: ComponentType;
}

export const VARIANTS: HomeVariant[] = [
  {
    id: "editorial",
    label: "方案 B · 编辑式长滚动",
    description: "浅色版式，传统自上而下滚动，大标题 + 留白 + 章节锚点。",
    Component: dynamic(() => import("./VariantEditorial"), { ssr: true }),
  },
  // 方案 A（整屏幻灯片 VariantSlideDeck）已整体删除。它的 Hero「流动等高线」
  // 效果单独封存在 ./preserved/PlanAHeroFlowField.tsx，之后要复用从那里取。
];

export const DEFAULT_VARIANT_ID = VARIANTS[0].id;

export const VARIANT_STORAGE_KEY = "nova-home-variant";

export function resolveVariant(id: string | null | undefined): HomeVariant {
  return VARIANTS.find((v) => v.id === id) ?? VARIANTS[0];
}
