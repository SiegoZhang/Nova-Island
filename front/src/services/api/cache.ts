import type { ApiRequestOptions } from "@/services/api/client";

/**
 * 公开、低频变化的社区目录数据缓存一分钟。
 *
 * 页面仍保持动态渲染，避免 Docker 构建阶段访问尚未启动的 backend；
 * 但运行时的 Server Component 请求可以复用 Next Data Cache。
 */
export const PUBLIC_DIRECTORY_REVALIDATE_SECONDS = 60;

export const publicDirectoryRequestOptions = {
  cache: "force-cache",
  next: { revalidate: PUBLIC_DIRECTORY_REVALIDATE_SECONDS },
} satisfies ApiRequestOptions;
