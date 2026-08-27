"use client";

import { formatFileSize, resolveMediaUrl } from "@/lib/media";
import type { PostAttachment } from "@/types/community";

interface PostAttachmentsProps {
  attachments: PostAttachment[];
}

export function PostAttachments({ attachments }: PostAttachmentsProps) {
  if (!attachments.length) return null;

  const images = attachments.filter((item) => item.kind === "image");
  const files = attachments.filter((item) => item.kind !== "image");

  return (
    <div className="mt-8 space-y-5">
      {images.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((item) => {
            const src = resolveMediaUrl(item.url);
            if (!src) return null;
            return (
              <a
                key={item.id}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-2xl border border-border bg-secondary/30"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={item.originalName}
                  loading="lazy"
                  decoding="async"
                  className="max-h-80 w-full object-cover transition-opacity group-hover:opacity-95"
                />
              </a>
            );
          })}
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((item) => {
            const href = resolveMediaUrl(item.url);
            if (!href) return null;
            return (
              <li key={item.id}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  download={item.originalName}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] transition-colors hover:border-foreground/20 hover:bg-secondary/40"
                >
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {item.originalName}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatFileSize(item.sizeBytes)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
