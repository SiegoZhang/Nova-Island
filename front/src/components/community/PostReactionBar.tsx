"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { BookmarkIcon, HeartIcon, ShareIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/services/api/errors";
import {
  bookmarkPost,
  getPost,
  likePost,
  unbookmarkPost,
  unlikePost,
} from "@/services/community/posts";
import { formatCount } from "@/lib/format";

interface PostReactionBarProps {
  postId: string;
  initialLikeCount: number;
  initialLiked?: boolean;
  initialBookmarked?: boolean;
}

export function PostReactionBar({
  postId,
  initialLikeCount,
  initialLiked = false,
  initialBookmarked = false,
}: PostReactionBarProps) {
  const { isAuthenticated, status } = useAuth();
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname || "/")}`;
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setBusy] = useState<"like" | "bookmark" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // SSR 无 token，登录后补拉一次个人互动态
  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    void getPost(postId)
      .then((post) => {
        if (!active) return;
        setLiked(post.isLiked);
        setBookmarked(post.isBookmarked);
        setLikeCount(post.likeCount);
      })
      .catch(() => {
        // 忽略补拉失败，保留 SSR 初始值
      });
    return () => {
      active = false;
    };
  }, [status, postId]);

  const requireLogin = !isAuthenticated && status !== "loading";

  const toggleLike = async () => {
    if (requireLogin || busy) return;
    setError(null);
    setBusy("like");
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const result = prevLiked
        ? await unlikePost(postId)
        : await likePost(postId);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (cause) {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      setError(
        cause instanceof ApiClientError ? cause.message : "操作失败，请稍后重试",
      );
    } finally {
      setBusy(null);
    }
  };

  const toggleBookmark = async () => {
    if (requireLogin || busy) return;
    setError(null);
    setBusy("bookmark");
    const prev = bookmarked;
    setBookmarked(!prev);
    try {
      const result = prev
        ? await unbookmarkPost(postId)
        : await bookmarkPost(postId);
      setBookmarked(result.bookmarked);
    } catch (cause) {
      setBookmarked(prev);
      setError(
        cause instanceof ApiClientError ? cause.message : "操作失败，请稍后重试",
      );
    } finally {
      setBusy(null);
    }
  };

  const showShareFeedback = (message: string) => {
    setShareFeedback(message);
    window.setTimeout(() => setShareFeedback(null), 2200);
  };

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    showShareFeedback("链接已复制");
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title: document.title });
        return;
      } catch (cause) {
        // 用户取消系统分享面板时不提示
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await copyLink(url);
    } catch {
      showShareFeedback("复制失败，请手动复制地址栏链接");
    }
  };

  return (
    <div className="mt-8 border-y border-border py-5">
      <div className="flex flex-wrap items-center gap-3">
        {requireLogin ? (
          <Link
            href={loginHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
          >
            <HeartIcon className="size-4" />
            登录后点赞
          </Link>
        ) : (
          <Button
            variant={liked ? "primary" : "outline"}
            size="md"
            onClick={toggleLike}
            disabled={status === "loading" || busy === "like"}
            aria-pressed={liked}
          >
            <HeartIcon className="size-4" />
            {liked ? "已赞" : "点赞"} {formatCount(likeCount)}
          </Button>
        )}

        {requireLogin ? (
          <Link
            href={loginHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-card/60 px-5 text-[13px] font-medium text-foreground transition-[background-color,border-color] duration-300 hover:border-foreground/25 hover:bg-card"
          >
            <BookmarkIcon className="size-4" />
            收藏
          </Link>
        ) : (
          <Button
            variant={bookmarked ? "primary" : "outline"}
            size="md"
            onClick={toggleBookmark}
            disabled={status === "loading" || busy === "bookmark"}
            aria-pressed={bookmarked}
          >
            <BookmarkIcon className="size-4" />
            {bookmarked ? "已收藏" : "收藏"}
          </Button>
        )}

        <Button variant="ghost" size="md" onClick={share}>
          <ShareIcon className="size-4" />
          分享
        </Button>
      </div>
      {shareFeedback ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-[12px] text-muted-foreground"
        >
          {shareFeedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
