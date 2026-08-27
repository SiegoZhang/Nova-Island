"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface HeroThemeValue {
  isHeroLight: boolean;
  setIsHeroLight: (value: boolean) => void;
  hideHeroRails: boolean;
  setHideHeroRails: (value: boolean) => void;
}

const HeroThemeContext = createContext<HeroThemeValue>({
  isHeroLight: false,
  setIsHeroLight: () => {},
  hideHeroRails: false,
  setHideHeroRails: () => {},
});

// Hero 同时有白底和黑底状态，导航栏透明叠在上面时要据此决定文字用深色还是浅色；
// 「光电流动」效果自身已经是浅色点阵背景，Hero 区域内的竖向网格线会显得多余，
// 因此还要能单独告知 GridRails 跳过 Hero 这一段。
// HeroSection 写入当前状态，Navbar / GridRails（同级组件，非父子关系）通过这个 context 读取。
export function HeroThemeProvider({ children }: { children: ReactNode }) {
  const [isHeroLight, setIsHeroLight] = useState(false);
  // 初始值给 true，不是 false：这个 Provider 只在首页（app/page.tsx）用，
  // 首页的 HeroSection 挂载后一定会把它设成 true。如果这里从 false 起步，
  // GridRails 会先按 false（显示 Hero 区域那两条竖线）画第一帧，等
  // HeroSection 的 useEffect 跑完才切到 true——这中间一帧会看到竖线闪一下
  // 又消失。首页永远不需要这两条线，直接把初始值定成最终状态，跳过闪烁。
  const [hideHeroRails, setHideHeroRails] = useState(true);

  return (
    <HeroThemeContext.Provider
      value={{ isHeroLight, setIsHeroLight, hideHeroRails, setHideHeroRails }}
    >
      {children}
    </HeroThemeContext.Provider>
  );
}

export function useHeroTheme() {
  return useContext(HeroThemeContext);
}
