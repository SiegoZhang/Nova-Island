/**
 * 媒体 URL 辅助：后端返回的绝对地址可直接用；
 * 相对路径则拼到 API 同源（去掉 /api/v1）。
 * 本机开发时把 `http://localhost:8000/media/...` 收成 `/media/...`，走 Next 反代，避免跨端口与 next/image 限制。
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) {
    return url;
  }

  const mediaPath = url.match(/^https?:\/\/[^/]+(\/media\/.+)$/i);
  if (mediaPath) {
    return mediaPath[1];
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("/")) {
    // 已是站点相对路径（含 /media/...）
    return url;
  }
  return url;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
