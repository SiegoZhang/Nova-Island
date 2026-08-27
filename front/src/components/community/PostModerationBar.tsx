"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  canEditPostContent,
  canFeaturePost,
  canModeratePost,
} from "@/lib/permissions";
import { ApiClientError } from "@/services/api/errors";
import {
  deletePost,
  featurePost,
  hidePost,
  unfeaturePost,
  unhidePost,
} from "@/services/community/posts";
import type { PostStatus } from "@/types/community";

interface PostModerationBarProps {
  postId: string;
  authorId: string;
  initialFeatured: boolean;
  initialStatus: PostStatus;
}

export function PostModerationBar({
  postId,
  authorId,
  initialFeatured,
  initialStatus,
}: PostModerationBarProps) {
  const router = useRouter();
  const { user, status: authStatus } = useAuth();
  const [featured, setFeatured] = useState(initialFeatured);
  const [postStatus, setPostStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authStatus !== "authenticated" || !user) return null;

  const canEdit = canEditPostContent({
    userId: user.id,
    authorId,
  });
  const canModerate = canModeratePost({
    userId: user.id,
    role: user.role,
    authorId,
  });
  const canFeature = canFeaturePost(user.role);

  if (!canEdit && !canModerate && !canFeature) return null;

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError ? cause.message : "操作失败，请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-3">
      <p className="text-[12px] font-medium text-muted-foreground">内容管理</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {canEdit ? (
          <Link
            href={`/community/${encodeURIComponent(postId)}/edit`}
            className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-card/60 px-3.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card"
          >
            编辑
          </Link>
        ) : null}

        {canFeature ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (featured) {
                  await unfeaturePost(postId);
                  setFeatured(false);
                } else {
                  await featurePost(postId);
                  setFeatured(true);
                }
              })
            }
          >
            {featured ? "取消加精" : "加精"}
          </Button>
        ) : null}

        {canFeature ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || postStatus === "deleted"}
            onClick={() =>
              void run(async () => {
                if (postStatus === "hidden") {
                  const post = await unhidePost(postId);
                  setPostStatus(post.status);
                } else {
                  const post = await hidePost(postId);
                  setPostStatus(post.status);
                }
              })
            }
          >
            {postStatus === "hidden" ? "取消隐藏" : "隐藏"}
          </Button>
        ) : null}

        {canModerate ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!window.confirm("确认删除这篇内容？此操作不可恢复。")) {
                  return;
                }
                await deletePost(postId);
                router.push("/community");
                router.refresh();
              })
            }
          >
            删除
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
