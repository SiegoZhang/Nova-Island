"use client";

import Link from "next/link";

import { CtaButton } from "@/components/CtaButton";

// 落地页（首页方案 B）的悬浮胶囊导航。
//
// 独立成一层、`fixed`、`z-[100]`，是 VariantEditorial 的**顶层子节点**（在那个
// 带 -translate-x-1/2 的容器之外，否则 fixed 会被 transform 祖先降级成随页面
// 滚动）。因此它永远贴在视口顶端、盖在所有内容和转场效果之上，不会像以前那样
// 被 <main> 的 z-10 上下文 / 星空转场弧盖住，也不会随 UniverseTransition 的
// sticky 舞台一起滚走。
//
// ⚠️ 胶囊造型与 components/Navbar.tsx（子页面版）、UniverseTransition 里的
// Hero 无关——那两处若改样式，这里也要同步。
//
// 入场：不再由 UniverseTransition 的时间线命令式驱动，改成挂载时自己播一段
// ~620ms 的淡入（.home-nav-in，globals.css；prefers-reduced-motion 下无动画）。

const navLinks = [
  { label: "首页", href: "/", active: true },
  { label: "AI社群", href: "/ai" },
  { label: "FDE", href: "/fde" },
  { label: "活动", href: "/community/events" },
  { label: "社区", href: "/community" },
  { label: "联系我们", href: "/contact" },
];

export function HomeNav() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[100] flex justify-center px-2 sm:top-3">
      <nav className="home-nav-in pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-full border border-white/50 bg-white/60 py-1.5 pr-1.5 pl-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55)] backdrop-blur-2xl">
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap pr-2 pl-1 text-[13px] font-bold tracking-tight text-[#111]"
        >
          NOVA Island
        </Link>
        {navLinks.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] transition-colors ${
              l.active
                ? "font-semibold text-[#111]"
                : "hidden text-black/55 hover:text-[#111] md:block"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/login"
          className="hidden shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] text-black/55 transition-colors hover:text-[#111] sm:block"
        >
          登录
        </Link>
        <CtaButton href="/register" size="sm" className="ml-1 shrink-0">
          加入岛屿
        </CtaButton>
      </nav>
    </div>
  );
}
