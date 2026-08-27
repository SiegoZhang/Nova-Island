"use client";

import { useState } from "react";

// 给点阵/方块编辑器用的轻量本地持久化：调整完的分档参数存进 localStorage，
// 下次打开页面会自动读回，相当于「永久保存」在这台设备的这个浏览器里。
export function useTierStorage<T>(key: string, defaults: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : defaults;
    } catch {
      return defaults;
    }
  });

  function save() {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    setValue(defaults);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return { value, setValue, save, reset };
}
