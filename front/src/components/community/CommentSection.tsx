"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ChatIcon, HeartIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { formatApiErrorMessage } from "@/lib/api-validation";
import { formatCount, formatRelative } from "@/lib/format";
import { canDeleteComment } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  createComment,
  deleteComment,
  likeComment,
  listComments,
  unlikeComment,
} from "@/services/community/comments";
import type { Comment } from "@/types/community";

interface CommentSectionProps {
  postId: string;
  initialComments: Comment[];
}

/** 扁平列表 → 根评论 + 一层回复（最多 2 层）。 */
function buildThread(comments: Comment[]) {
  const byId = new Map(comments.map((item) => [item.id, item]));
  const roots: Comment[] = [];
  const repliesByRoot = new Map<string, Comment[]>();

  for (const comment of comments) {
    if (!comment.parentId) {
      roots.push(comment);
      continue;
    }
    let rootId = comment.parentId;
    const parent = byId.get(comment.parentId);
    if (parent?.parentId) {
      rootId = parent.parentId;
    }
    const bucket = repliesByRoot.get(rootId) ?? [];
    bucket.push(comment);
    repliesByRoot.set(rootId, bucket);
  }

  return { roots, repliesByRoot };
}

function CommentItem({
  postId,
  comment,
  depth,
  canDelete,
  canReply,
  onDeleted,
  onReply,
  onActionError,
}: {
  postId: string;
  comment: Comment;
  depth: 0 | 1;
  canDelete: boolean;
  canReply: boolean;
  onDeleted: (id: string) => void;
  onReply: (comment: Comment) => void;
  onActionError: (message: string) => void;
}) {
  const { isAuthenticated } = useAuth();
  const [liked, setLiked] = useState(comment.isLiked);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLiked(comment.isLiked);
    setLikeCount(comment.likeCount);
  }, [comment.isLiked, comment.likeCount, comment.id]);

  const toggleLike = async () => {
    if (!isAuthenticated || busy) return;
    setBusy(true);
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const result = prevLiked
        ? await unlikeComment(postId, comment.id)
        : await likeComment(postId, comment.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (cause) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      onActionError(formatApiErrorMessage(cause, "点赞失败，请稍后重试"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || busy) return;
    const message =
      depth === 0 && comment.replyCount > 0
        ? "确认删除这条评论？其下回复也会一并删除。"
        : "确认删除这条评论？";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      await deleteComment(postId, comment.id);
      onDeleted(comment.id);
    } catch (cause) {
      onActionError(formatApiErrorMessage(cause, "删除失败，请稍后重试"));
      setBusy(false);
    }
  };

  return (
    <li className={cn("flex gap-3", depth === 1 && "mt-4")}>
      <Link
        href={`/u/${comment.author.username}`}
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar
          src={comment.author.avatarUrl}
          name={comment.author.displayName}
          size={depth === 0 ? 36 : 32}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/u/${comment.author.username}`}
            className="text-[13px] font-medium text-foreground transition-colors hover:text-primary"
          >
            {comment.author.displayName}
          </Link>
          {comment.replyToUser ? (
            <span className="text-[12px] text-muted-foreground">
              回复{" "}
              <Link
                href={`/u/${comment.replyToUser.username}`}
                className="text-foreground/80 hover:text-foreground"
              >
                @{comment.replyToUser.username}
              </Link>
            </span>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {formatRelative(comment.createdAt)}
          </span>
        </div>
        <p className="mt-1 text-[13px] leading-6 text-foreground/90">
          {comment.content}
        </p>
        <div className="mt-2 flex items-center gap-4 text-[12px] text-muted-foreground">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={toggleLike}
              disabled={busy}
              aria-pressed={liked}
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground disabled:opacity-50"
            >
              <HeartIcon className="size-3.5" />
              {formatCount(likeCount)}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <HeartIcon className="size-3.5" />
              {formatCount(likeCount)}
            </span>
          )}
          {canReply ? (
            <button
              type="button"
              onClick={() => onReply(comment)}
              disabled={busy}
              className="transition-colors hover:text-foreground disabled:opacity-50"
            >
              回复
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="transition-colors hover:text-destructive disabled:opacity-50"
            >
              删除
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function CommentSection({
  postId,
  initialComments,
}: CommentSectionProps) {
  const { isAuthenticated, status, user } = useAuth();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname || "/")}`;
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void listComments(postId, { page: 1, pageSize: 100 })
      .then((page) => {
        if (active) setComments(page.items);
      })
      .catch(() => {
        // 保留 SSR 初始列表
      });
    return () => {
      active = false;
    };
  }, [status, postId]);

  const { roots, repliesByRoot } = useMemo(
    () => buildThread(comments),
    [comments],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setError(null);
    setSubmitting(true);
    try {
      const created = await createComment(postId, {
        content: trimmed,
        parentId: replyTo?.id ?? null,
      });
      setComments((prev) => {
        const next = [...prev, created];
        if (!created.parentId) return next;
        return next.map((item) =>
          item.id === created.parentId
            ? { ...item, replyCount: item.replyCount + 1 }
            : item,
        );
      });
      setContent("");
      setReplyTo(null);
    } catch (cause) {
      setError(formatApiErrorMessage(cause, "评论发布失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleted = (id: string) => {
    setComments((prev) => {
      const removed = prev.find((item) => item.id === id);
      if (!removed) return prev;
      if (!removed.parentId) {
        // 根评论删除：去掉自身及所有挂在其下的回复
        return prev.filter(
          (item) => item.id !== id && item.parentId !== id,
        );
      }
      return prev
        .filter((item) => item.id !== id)
        .map((item) =>
          item.id === removed.parentId
            ? {
                ...item,
                replyCount: Math.max(0, item.replyCount - 1),
              }
            : item,
        );
    });
    setReplyTo((current) => (current?.id === id ? null : current));
  };

  const composerPlaceholder = replyTo
    ? `回复 @${replyTo.author.username}……`
    : "分享你的看法……";

  return (
    <section className="mt-10" aria-labelledby="comments-title">
      <h2
        id="comments-title"
        className="text-[18px] font-semibold tracking-[-0.01em] text-foreground"
      >
        评论 {comments.length > 0 ? `· ${comments.length}` : ""}
      </h2>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        {status === "loading" ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted" />
        ) : isAuthenticated ? (
          <form onSubmit={handleSubmit}>
            {replyTo ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-[12px] text-muted-foreground">
                <span>
                  正在回复{" "}
                  <span className="font-medium text-foreground">
                    @{replyTo.author.username}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-foreground/70 transition-colors hover:text-foreground"
                >
                  取消
                </button>
              </div>
            ) : null}
            <Textarea
              rows={3}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={composerPlaceholder}
              maxLength={2000}
              disabled={submitting}
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">
                {content.length}/2000
              </p>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !content.trim()}
              >
                {submitting ? "发布中……" : replyTo ? "发布回复" : "发布"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <textarea
              disabled
              rows={2}
              placeholder="登录后即可参与讨论……"
              className="w-full resize-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">
                发表评论需要先登录
              </p>
              <Link
                href={loginHref}
                className="inline-flex h-8 items-center justify-center rounded-full bg-primary px-3.5 text-[12px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
              >
                去登录
              </Link>
            </div>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}

      {comments.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<ChatIcon className="size-6" />}
          title="还没有评论"
          description="成为第一个参与讨论的人，分享你的看法。"
        />
      ) : (
        <ul className="mt-6 space-y-6">
          {roots.map((root) => {
            const replies = repliesByRoot.get(root.id) ?? [];
            return (
              <li key={root.id}>
                <ul className="space-y-0">
                  <CommentItem
                    postId={postId}
                    comment={root}
                    depth={0}
                    canDelete={canDeleteComment({
                      userId: user?.id,
                      role: user?.role,
                      authorId: root.author.id,
                    })}
                    canReply={isAuthenticated}
                    onDeleted={handleDeleted}
                    onReply={setReplyTo}
                    onActionError={setError}
                  />
                </ul>
                {replies.length > 0 ? (
                  <ul className="mt-1 ml-4 border-l border-border pl-4 sm:ml-8 sm:pl-5">
                    {replies.map((reply) => (
                      <CommentItem
                        key={reply.id}
                        postId={postId}
                        comment={reply}
                        depth={1}
                        canDelete={canDeleteComment({
                          userId: user?.id,
                          role: user?.role,
                          authorId: reply.author.id,
                        })}
                        canReply={isAuthenticated}
                        onDeleted={handleDeleted}
                        onReply={setReplyTo}
                        onActionError={setError}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
