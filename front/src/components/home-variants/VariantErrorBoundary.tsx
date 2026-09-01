"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

// 某一套首页方案内部报错时，只让那套显示一个兜底提示，不连累切换器和
// 其它方案（换一套仍然能正常渲染）。variantId 变化时通过 key 重置，
// 见 HomeVariantHost。
interface Props {
  variantId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class VariantErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.variantId !== this.props.variantId && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[home-variant:${this.props.variantId}] 渲染出错`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100svh] flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white/70">
          <p className="text-sm">该首页方案渲染出错，请用右下角切换器换一套。</p>
          <p className="max-w-lg font-mono text-xs text-white/40">
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
