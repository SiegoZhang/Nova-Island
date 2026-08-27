import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const dimension = { width: size, height: size };
  const resolved = resolveMediaUrl(src);

  if (resolved) {
    return (
      // 用原生 img：导入头像走 /media 反代，避免 next/image 跨端口配置问题
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={`${name} 头像`}
        width={size}
        height={size}
        style={dimension}
        decoding="async"
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      style={dimension}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-secondary-foreground",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
