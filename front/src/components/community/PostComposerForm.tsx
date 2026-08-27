"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Breadcrumb } from "@/components/community/Breadcrumb";
import { MarkdownContent } from "@/components/community/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize, resolveMediaUrl } from "@/lib/media";
import { canEditPostContent, isStaff } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ApiClientError } from "@/services/api/errors";
import { createPost, updatePost } from "@/services/community/posts";
import { listTagLibrary } from "@/services/community/tags";
import { uploadFile } from "@/services/community/uploads";
import type {
  AttachmentInput,
  PostStatus,
  PostVisibility,
} from "@/types/community";

const MAX_ATTACHMENTS = 10;
const MAX_TAGS = 10;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface PostComposerInitialValues {
  title: string;
  content: string;
  tags: string[];
  visibility: PostVisibility;
  coverImageUrl?: string | null;
  attachments?: AttachmentInput[];
  status?: Extract<PostStatus, "draft" | "published" | "hidden">;
}

interface PostComposerFormProps {
  mode?: "create" | "edit";
  postId?: string;
  authorId?: string;
  initial?: PostComposerInitialValues;
}

function defaultVisibility(
  role: string | null | undefined,
  initial?: PostVisibility,
): PostVisibility {
  if (initial) {
    if (initial === "public" && !isStaff(role)) return "members";
    return initial;
  }
  return "members";
}

type EditorTab = "edit" | "preview";
type SaveMode = "draft" | "publish";

export function PostComposerForm({
  mode = "create",
  postId,
  authorId,
  initial,
}: PostComposerFormProps) {
  const { status, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const isEdit = mode === "edit";
  const staff = isStaff(user?.role);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const insertImageRef = useRef<HTMLInputElement>(null);

  const initialStatus = initial?.status ?? "published";
  const isDraftEdit = isEdit && initialStatus === "draft";
  const canSaveDraft = !isEdit || isDraftEdit;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initial?.tags ?? [],
  );
  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [visibility, setVisibility] = useState<PostVisibility>(() =>
    defaultVisibility(user?.role, initial?.visibility),
  );
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(
    initial?.coverImageUrl ?? null,
  );
  const [attachments, setAttachments] = useState<AttachmentInput[]>(
    initial?.attachments ?? [],
  );
  const [editorTab, setEditorTab] = useState<EditorTab>("edit");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<SaveMode | null>(null);
  const [uploading, setUploading] = useState<
    "cover" | "files" | "inline" | null
  >(null);
  const [forbidden, setForbidden] = useState(false);

  const loginNext = isEdit ? `/community/${postId}/edit` : "/community/new";
  const cancelHref = isEdit
    ? isDraftEdit
      ? "/drafts"
      : `/community/${postId}`
    : "/community/latest";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(loginNext)}`);
    }
  }, [status, router, loginNext]);

  useEffect(() => {
    if (!isEdit || status !== "authenticated" || !user || !authorId) return;
    if (!canEditPostContent({ userId: user.id, authorId })) {
      setForbidden(true);
    }
  }, [isEdit, status, user, authorId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    setTagsLoading(true);
    listTagLibrary()
      .then((tags) => {
        if (cancelled) return;
        const names = tags.map((item) => item.name);
        setCatalogTags(names);
        // 旧帖标签不在库中则忽略
        setSelectedTags((prev) => prev.filter((name) => names.includes(name)));
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogTags([]);
          setError((prev) => prev ?? "标签库加载失败，可稍后刷新重试");
        }
      })
      .finally(() => {
        if (!cancelled) setTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!user) return;
    setVisibility((prev) => {
      if (prev === "public" && !isStaff(user.role)) return "members";
      return prev;
    });
  }, [user]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((item) => item !== tag);
      if (prev.length >= MAX_TAGS) {
        setError(`最多选择 ${MAX_TAGS} 个标签`);
        return prev;
      }
      setError(null);
      return [...prev, tag];
    });
  };

  const insertAtCursor = (snippet: string) => {
    const el = contentRef.current;
    if (!el) {
      setContent((prev) => `${prev}${prev.endsWith("\n") || !prev ? "" : "\n"}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const needsPad =
      before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${needsPad}${snippet}${after}`;
    setContent(next);
    requestAnimationFrame(() => {
      const pos = start + needsPad.length + snippet.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  if (status === "loading" || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="mt-8 h-72 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-8 text-center">
        <p className="text-[15px] font-medium text-foreground">无权编辑该内容</p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          只有作者可以修改帖子正文。
        </p>
        <Link
          href={postId ? `/community/${postId}` : "/community"}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground"
        >
          返回
        </Link>
      </div>
    );
  }

  const handleCoverChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > IMAGE_MAX_BYTES) {
      setError("图片不能超过 5MB");
      return;
    }
    setError(null);
    setUploading("cover");
    try {
      const uploaded = await uploadFile(file);
      if (uploaded.kind !== "image") {
        setError("封面仅支持图片（JPEG / PNG / WebP / GIF）");
        return;
      }
      setCoverImageUrl(uploaded.url);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "封面上传失败",
      );
    } finally {
      setUploading(null);
    }
  };

  const handleInlineImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > IMAGE_MAX_BYTES) {
      setError("图片不能超过 5MB");
      return;
    }
    setError(null);
    setUploading("inline");
    try {
      const uploaded = await uploadFile(file);
      if (uploaded.kind !== "image") {
        setError("正文插图仅支持图片（JPEG / PNG / WebP / GIF）");
        return;
      }
      const alt = uploaded.originalName.replace(/\.[^.]+$/, "") || "图片";
      insertAtCursor(`![${alt}](${uploaded.url})\n`);
      setEditorTab("edit");
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "插图上传失败",
      );
    } finally {
      setUploading(null);
    }
  };

  const handleFilesChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setError(`每帖最多 ${MAX_ATTACHMENTS} 个附件`);
      return;
    }
    const oversizedImage = files.find(
      (file) =>
        file.type.startsWith("image/") && file.size > IMAGE_MAX_BYTES,
    );
    if (oversizedImage) {
      setError("图片不能超过 5MB");
      return;
    }
    setError(null);
    setUploading("files");
    try {
      const selected = files.slice(0, room);
      const uploaded: Awaited<ReturnType<typeof uploadFile>>[] = [];
      for (const file of selected) {
        uploaded.push(await uploadFile(file));
      }
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((item) => ({
          storageKey: item.storageKey,
          url: item.url,
          originalName: item.originalName,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
        })),
      ]);
      if (files.length > room) {
        setError(`已达上限，仅添加了前 ${room} 个文件`);
      }
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "附件上传失败",
      );
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async (saveMode: SaveMode) => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (saveMode === "publish") {
      if (!trimmedTitle || !trimmedContent) {
        setError("发布需要填写标题和正文");
        return;
      }
    } else if (!trimmedTitle && !trimmedContent) {
      setError("草稿至少填写标题或正文其一");
      return;
    }

    if (!canSaveDraft && saveMode === "draft") {
      setError("已发布内容不能改回草稿，如需下架请使用隐藏");
      return;
    }

    const nextVisibility: PostVisibility =
      visibility === "public" && !staff ? "members" : visibility;

    setError(null);
    setSubmitting(saveMode);
    try {
      if (isEdit) {
        if (!postId) throw new Error("missing post id");
        const updated = await updatePost(postId, {
          title: trimmedTitle,
          content: trimmedContent,
          tags: selectedTags,
          visibility: nextVisibility,
          coverImageUrl,
          attachments,
          status: saveMode === "draft" ? "draft" : "published",
        });
        if (updated.status === "draft") {
          router.push("/drafts");
        } else {
          router.push(`/community/${postId}`);
        }
      } else {
        const created = await createPost({
          title: trimmedTitle,
          content: trimmedContent,
          tags: selectedTags,
          visibility: nextVisibility,
          coverImageUrl,
          attachments,
          status: saveMode === "draft" ? "draft" : "published",
        });
        if (created.status === "draft") {
          router.push("/drafts");
        } else {
          router.push(`/community/${created.id}`);
        }
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : saveMode === "draft"
            ? "保存草稿失败，请稍后重试"
            : isEdit
              ? "保存失败，请稍后重试"
              : "发布失败，请稍后重试",
      );
      setSubmitting(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleSave("publish");
  };

  const coverSrc = resolveMediaUrl(coverImageUrl);
  const busy = submitting !== null || uploading !== null;
  const canPublish = Boolean(title.trim() && content.trim());
  const canDraft = Boolean(title.trim() || content.trim());

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb
        items={
          isEdit
            ? [
                { label: "社区", href: "/community" },
                {
                  label: isDraftEdit ? "草稿" : "内容",
                  href: isDraftEdit ? "/drafts" : `/community/${postId}`,
                },
                { label: "编辑" },
              ]
            : [
                { label: "社区", href: "/community" },
                { label: "最新", href: "/community/latest" },
                { label: "发布动态" },
              ]
        }
      />

      <header className="mt-5">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {isEdit
            ? isDraftEdit
              ? "编辑草稿"
              : "编辑内容"
            : "发布动态"}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
          {isEdit
            ? isDraftEdit
              ? "可继续改稿、插入配图后发布；标签仅能从标签库选择。"
              : "修改标题、正文、封面、附件、标签或可见范围。已发布内容不能改回草稿。"
            : "支持 Markdown 预览与正文插图；可先存草稿。标签仅能从标签库点选。"}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 sm:p-7"
      >
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[13px] text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-title">标题</Label>
          <Input
            id="post-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="一句话说清你想分享的主题"
            maxLength={200}
            disabled={busy}
          />
          <p className="text-[12px] text-muted-foreground">
            {title.length}/200
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="post-content">正文</Label>
            <div
              className="flex items-center gap-1 rounded-full border border-border bg-secondary/40 p-0.5"
              role="tablist"
              aria-label="编辑与预览"
            >
              {(
                [
                  { id: "edit", label: "编辑" },
                  { id: "preview", label: "预览" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={editorTab === tab.id}
                  disabled={busy}
                  onClick={() => setEditorTab(tab.id)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full px-3 text-[12px] font-medium transition-colors",
                    editorTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {editorTab === "edit" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => insertImageRef.current?.click()}
                >
                  {uploading === "inline" ? "插图上传中…" : "插入图片"}
                </Button>
                <input
                  ref={insertImageRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleInlineImageChange}
                />
                <p className="text-[12px] text-muted-foreground">
                  上传后写入 Markdown 图片语法，可在预览中查看。
                </p>
              </div>
              <Textarea
                ref={contentRef}
                id="post-content"
                rows={14}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="写下你的经验、步骤或踩坑记录……支持 Markdown。"
                maxLength={50000}
                disabled={busy}
              />
            </>
          ) : (
            <div className="min-h-56 rounded-2xl border border-border bg-background px-4 py-4">
              {content.trim() ? (
                <MarkdownContent content={content} />
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  暂无正文，切换到编辑写入内容。
                </p>
              )}
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">
            {content.length}/50000
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="post-cover">封面图（可选）</Label>
          {coverSrc ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverSrc}
                alt="封面预览"
                className="max-h-56 w-full object-cover"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="post-cover"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleCoverChange}
              disabled={busy}
              className="max-w-xs cursor-pointer file:mr-3"
            />
            {coverImageUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setCoverImageUrl(null)}
              >
                移除封面
              </Button>
            ) : null}
            {uploading === "cover" ? (
              <span className="text-[12px] text-muted-foreground">上传中……</span>
            ) : null}
          </div>
          <p className="text-[12px] text-muted-foreground">
            封面用于列表缩略图；详情页不再单独展示大图。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="post-files">
            附件（可选，最多 {MAX_ATTACHMENTS} 个）
          </Label>
          <Input
            id="post-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/zip,.doc,.docx,.xls,.xlsx"
            onChange={handleFilesChange}
            disabled={busy || attachments.length >= MAX_ATTACHMENTS}
            className="max-w-md cursor-pointer file:mr-3"
          />
          {uploading === "files" ? (
            <p className="text-[12px] text-muted-foreground">附件上传中……</p>
          ) : null}
          {attachments.length > 0 ? (
            <ul className="space-y-2">
              {attachments.map((item) => (
                <li
                  key={item.storageKey}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-[12px]"
                >
                  <span className="min-w-0 truncate text-foreground">
                    {item.originalName}
                    <span className="ml-2 text-muted-foreground">
                      {formatFileSize(item.sizeBytes)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.filter((row) => row.storageKey !== item.storageKey),
                      )
                    }
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-foreground">
            标签（可选，最多 {MAX_TAGS} 个）
          </legend>
          <p className="text-[12px] text-muted-foreground">
            仅支持从可用标签库中点选。
          </p>
          {tagsLoading ? (
            <div className="h-9 animate-pulse rounded-xl bg-muted" />
          ) : catalogTags.length === 0 ? (
            <p className="rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-[13px] text-muted-foreground">
              标签库暂空。请联系管理员在后台添加标签后再选。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {catalogTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={busy}
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-secondary",
                      busy && "opacity-60",
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
          {selectedTags.length > 0 ? (
            <p className="text-[12px] text-muted-foreground">
              已选 {selectedTags.length}/{MAX_TAGS}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-foreground">
            可见范围
          </legend>
          <div className="flex flex-col gap-2">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-3.5 py-3",
                visibility === "members" && "border-primary/40 bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="visibility"
                value="members"
                className="mt-1"
                checked={visibility === "members"}
                onChange={() => setVisibility("members")}
                disabled={busy}
              />
              <span>
                <span className="block text-[13px] font-medium text-foreground">
                  仅登录岛民
                </span>
              </span>
            </label>
            {staff ? (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-3.5 py-3",
                  visibility === "public" && "border-primary/40 bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  className="mt-1"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                  disabled={busy}
                />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">
                    全站公开
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    未登录也可阅读；仅版主 / 管理员可选。
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                发布内容仅对登录用户可见。
              </p>
            )}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            取消
          </Link>
          {canSaveDraft ? (
            <Button
              type="button"
              size="md"
              variant="outline"
              disabled={busy || !canDraft}
              onClick={() => void handleSave("draft")}
            >
              {submitting === "draft" ? "保存中……" : "存草稿"}
            </Button>
          ) : null}
          <Button type="submit" size="md" disabled={busy || !canPublish}>
            {submitting === "publish"
              ? isEdit
                ? "保存中……"
                : "发布中……"
              : isEdit
                ? isDraftEdit
                  ? "发布"
                  : "保存修改"
                : "发布"}
          </Button>
        </div>
      </form>
    </div>
  );
}
