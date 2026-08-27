export type ClassValue =
  | string
  | number
  | null
  | boolean
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

/**
 * 轻量的 className 合并工具（clsx 风格），用于条件式拼接 Tailwind 类名。
 * 不额外引入依赖，保持项目零新增运行时包体。
 */
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  const push = (value: ClassValue): void => {
    if (!value) return;

    if (typeof value === "string" || typeof value === "number") {
      classes.push(String(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }

    if (typeof value === "object") {
      for (const [key, active] of Object.entries(value)) {
        if (active) classes.push(key);
      }
    }
  };

  inputs.forEach(push);
  return classes.join(" ");
}
