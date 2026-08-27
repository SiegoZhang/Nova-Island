import type { ReactNode } from "react";

import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** 与这些 URL 相同的图片不渲染（例如封面图已在列表展示） */
  skipImageUrls?: string[];
  /** 跳过正文开头连续的独立图片块，直接从文字内容起读 */
  skipLeadingImages?: boolean;
}

/**
 * 轻量 Markdown 渲染（标题 / 段落 / 列表 / 链接 / 粗斜体 / 图片 / 分隔线）。
 * 不执行原始 HTML，避免 XSS。
 */
export function MarkdownContent({
  content,
  className,
  skipImageUrls = [],
  skipLeadingImages = false,
}: MarkdownContentProps) {
  const skip = new Set(
    skipImageUrls
      .map((url) => resolveMediaUrl(url) ?? url)
      .filter(Boolean) as string[],
  );
  let blocks = splitBlocks(normalizeImportedMarkdown(content)).filter(
    (block) => {
      if (block.type !== "image") return true;
      const src = resolveMediaUrl(block.src) ?? block.src;
      return !skip.has(src);
    },
  );

  if (skipLeadingImages) {
    let start = 0;
    while (start < blocks.length) {
      const block = blocks[start];
      if (block?.type === "image" || block?.type === "hr") {
        start += 1;
        continue;
      }
      break;
    }
    if (start > 0) {
      blocks = blocks.slice(start);
    }
  }

  return (
    <div
      className={cn(
        "space-y-4 overflow-x-auto text-[15px] leading-8 break-words text-foreground/90 [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
        className,
      )}
    >
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

/** 去掉导入残留的缩进与空 HTML 壳，避免首行「莫名缩进」。 */
export function normalizeImportedMarkdown(src: string): string {
  let text = src.replace(/\r\n/g, "\n").trim();
  // 去掉仅含空白的缩进行
  text = text
    .split("\n")
    .map((line) => {
      // 保留 markdown 代码块外的合理缩进：列表续行除外，去掉模板残留的大段前导空格
      if (/^\s{4,}/.test(line) && !/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        return line.replace(/^\s+/, "");
      }
      return line.replace(/[ \t]+$/g, "");
    })
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

type Block =
  | { type: "h1" | "h2" | "h3" | "p" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "hr" }
  | { type: "image"; alt: string; src: string };

function splitBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      blocks.push({ type: tag, text: heading[2].trim() });
      i += 1;
      continue;
    }

    const onlyImage = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
    if (onlyImage) {
      blocks.push({ type: "image", alt: onlyImage[1], src: onlyImage[2] });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        parts.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: parts.join("\n") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const parts: string[] = [line.trimStart()];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (!next.trim()) break;
      if (
        /^(#{1,3})\s+/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^>\s?/.test(next) ||
        /^---+$/.test(next.trim()) ||
        /^!\[/.test(next.trim())
      ) {
        break;
      }
      parts.push(next.trimStart());
      i += 1;
    }
    const paragraph = parts.join("\n").trim();
    if (paragraph) {
      blocks.push({ type: "p", text: paragraph });
    }
  }

  return blocks;
}

function Block({ block }: { block: Block }) {
  if (block.type === "hr") {
    return <hr className="border-border" />;
  }
  if (block.type === "image") {
    const src = safeImageSrc(resolveMediaUrl(block.src) ?? block.src);
    if (!src) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={block.alt || ""}
        decoding="async"
        className="my-2 max-h-72 w-full rounded-xl border border-border object-contain bg-secondary/30"
      />
    );
  }
  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1 pl-6">
        {block.items.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="list-decimal space-y-1 pl-6">
        {block.items.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "quote") {
    return (
      <blockquote className="border-l-2 border-border pl-4 text-muted-foreground">
        {renderInline(block.text)}
      </blockquote>
    );
  }
  if (block.type === "h1") {
    return (
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        {renderInline(block.text)}
      </h2>
    );
  }
  if (block.type === "h2") {
    return (
      <h3 className="text-xl font-semibold tracking-tight text-foreground">
        {renderInline(block.text)}
      </h3>
    );
  }
  if (block.type === "h3") {
    return (
      <h4 className="text-lg font-semibold text-foreground">
        {renderInline(block.text)}
      </h4>
    );
  }
  if (block.type === "p") {
    return <p className="whitespace-pre-wrap">{renderInline(block.text)}</p>;
  }
  return null;
}

/**
 * 链接协议白名单：只放行 http/https/mailto/站内相对路径。
 * 其余（javascript:/data:/vbscript: 等）一律降级为纯文本，不产生可点击锚点。
 */
export function safeLinkHref(raw: string): string | null {
  const url = raw.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!url) return null;
  // 站内相对路径（含 /media/...）与锚点
  if (url.startsWith("/") || url.startsWith("#")) return url;
  // 有显式协议时按白名单判断
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    return name === "http" || name === "https" || name === "mailto"
      ? url
      : null;
  }
  // 无协议的裸域名（example.com/x）视为站外链接，补 https
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(url)) return `https://${url}`;
  return null;
}

/** 图片 src 白名单：http/https/站内路径/data:image。 */
export function safeImageSrc(raw: string): string | null {
  const url = raw.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!url) return null;
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i.test(url)) return url;
  return safeLinkHref(url);
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    if (match[1]) {
      const src = safeImageSrc(resolveMediaUrl(match[3]) ?? match[3]);
      if (src) {
        nodes.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key++}
            src={src}
            alt={match[2] || ""}
            decoding="async"
            className="my-2 block max-h-80 max-w-full rounded-lg border border-border object-contain"
          />,
        );
      } else {
        nodes.push(match[2] || "");
      }
    } else if (match[4]) {
      const raw = match[6];
      const href = safeLinkHref(raw);
      const label =
        match[5] === raw || match[5].startsWith("http") ? "查看链接" : match[5];
      // 协议不在白名单：只渲染文字，不给可点击锚点
      nodes.push(
        href === null ? (
          label
        ) : (
          <a key={key++} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ),
      );
    } else if (match[7]) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[8]}
        </strong>,
      );
    } else if (match[9]) {
      nodes.push(
        <em key={key++} className="italic">
          {match[10]}
        </em>,
      );
    } else if (match[11]) {
      nodes.push(
        <code
          key={key++}
          className="break-all rounded bg-secondary px-1.5 py-0.5 text-[13px]"
        >
          {match[12]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}
