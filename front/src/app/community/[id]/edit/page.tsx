import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostComposerForm } from "@/components/community/PostComposerForm";
import type { ApiRequestOptions } from "@/services/api/client";
import { ApiClientError } from "@/services/api/errors";
import { serverApiOptions } from "@/services/api/server";
import { getPost } from "@/services/community/posts";
import type { PostVisibility } from "@/types/community";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function loadPost(id: string, requestOptions: ApiRequestOptions) {
  try {
    return await getPost(id, requestOptions);
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status === 404) {
      return null;
    }
    throw cause;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await loadPost(id, await serverApiOptions());
  if (!post) return { title: "编辑内容 · 新岛社区" };
  return {
    title: `编辑：${post.title} · 新岛社区`,
  };
}

export default async function CommunityEditPostPage({ params }: PageProps) {
  const { id } = await params;
  const post = await loadPost(id, await serverApiOptions());

  if (!post || post.status === "deleted") {
    notFound();
  }

  return (
    <PostComposerForm
      mode="edit"
      postId={post.id}
      authorId={post.author.id}
      initial={{
        title: post.title,
        content: post.content,
        tags: post.tags,
        visibility: post.visibility as PostVisibility,
        coverImageUrl: post.coverImageUrl,
        attachments: (post.attachments ?? []).map((item) => ({
          storageKey: item.storageKey,
          url: item.url,
          originalName: item.originalName,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
        })),
        status: post.status,
      }}
    />
  );
}
