"use client";

import { useCallback, useEffect, useState } from "react";

import { HomeVariantSwitcher } from "./HomeVariantSwitcher";
import { VariantErrorBoundary } from "./VariantErrorBoundary";
import { VARIANTS, VARIANT_STORAGE_KEY, resolveVariant } from "./registry";

// 首页外壳：决定当前渲染哪一套方案，并挂上角落的切换器。
//
// 选择来源优先级：URL 的 ?home=<id>（initialVariantId，服务端已按它渲染）
// > localStorage 记住的上次选择 > 注册表第一个（默认）。
//
// 切方案时给方案组件换 key → 整棵子树重挂载，彻底隔离：上一套的
// 定时器 / 滚动监听 / Three.js 上下文不会残留到下一套。
interface Props {
  initialVariantId: string | null;
}

export function HomeVariantHost({ initialVariantId }: Props) {
  const [activeId, setActiveId] = useState(() => resolveVariant(initialVariantId).id);

  useEffect(() => {
    // URL 已明确指定就听 URL 的；否则尝试恢复上次选择。
    if (initialVariantId) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(VARIANT_STORAGE_KEY);
    } catch {
      /* localStorage 不可用，忽略 */
    }
    if (stored && stored !== activeId && VARIANTS.some((v) => v.id === stored)) {
      setActiveId(stored);
    }
    // 只在挂载时按 initialVariantId 跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVariantId]);

  const select = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(VARIANT_STORAGE_KEY, id);
    } catch {
      /* 忽略 */
    }
    // 更新地址栏但不触发 Next 路由跳转 / 滚动，方便把链接直接发给评审。
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("home", id);
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  const active = resolveVariant(activeId);
  const ActiveComponent = active.Component;

  return (
    <>
      <VariantErrorBoundary variantId={active.id}>
        <ActiveComponent key={active.id} />
      </VariantErrorBoundary>
      <HomeVariantSwitcher activeId={active.id} onSelect={select} />
    </>
  );
}
