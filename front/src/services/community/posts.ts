import {
  apiClient,
  type ApiRequestOptions,
} from "@/services/api/client";
import type { PaginatedData } from "@/types/api";
import type {
  AttachmentInput,
  Post,
  PostStatus,
  PostVisibility,
} from "@/types/community";

export interface ListPostsParams {
  page?: number;
  pageSize?: number;
  tag?: string;
  /** true 只返回「精华」帖；省略则按时间返回「最新」全部。 */
  featured?: boolean;
}

export interface CreatePostInput {
  title: string;
  content: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  tags?: string[];
  attachments?: AttachmentInput[];
  status?: Extract<PostStatus, "draft" | "published">;
  visibility?: PostVisibility;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  tags?: string[];
  /** 传入则全量替换附件（可空数组清空）。 */
  attachments?: AttachmentInput[];
  status?: Extract<PostStatus, "draft" | "published" | "hidden">;
  visibility?: PostVisibility;
}

export interface LikeState {
  liked: boolean;
  likeCount: number;
}

export interface BookmarkState {
  bookmarked: boolean;
}

export function listPosts(
  params: ListPostsParams = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<PaginatedData<Post>>("/posts", {
    ...options,
    query: {
      ...options.query,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      tag: params.tag,
      featured: params.featured,
    },
  });
}

export function listPostTags(
  params: { featured?: boolean } = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<string[]>("/posts/tags", {
    ...options,
    query: {
      ...options.query,
      featured: params.featured,
    },
  });
}

export function searchPosts(
  params: {
    q: string;
    page?: number;
    pageSize?: number;
  },
  options: ApiRequestOptions = {},
) {
  return apiClient.get<PaginatedData<Post>>("/posts/search", {
    ...options,
    query: {
      ...options.query,
      q: params.q,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
}

export function getPost(id: string, options: ApiRequestOptions = {}) {
  return apiClient.get<Post>(`/posts/${encodeURIComponent(id)}`, options);
}

export function createPost(input: CreatePostInput) {
  return apiClient.post<Post>("/posts", {
    title: input.title,
    content: input.content,
    excerpt: input.excerpt ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    status: input.status ?? "published",
    visibility: input.visibility ?? "members",
  });
}

export function updatePost(id: string, input: UpdatePostInput) {
  return apiClient.patch<Post>(`/posts/${encodeURIComponent(id)}`, input);
}

export function deletePost(id: string) {
  return apiClient.delete<null>(`/posts/${encodeURIComponent(id)}`);
}

export function likePost(id: string) {
  return apiClient.post<LikeState>(`/posts/${encodeURIComponent(id)}/like`);
}

export function unlikePost(id: string) {
  return apiClient.delete<LikeState>(`/posts/${encodeURIComponent(id)}/like`);
}

export function bookmarkPost(id: string) {
  return apiClient.post<BookmarkState>(
    `/posts/${encodeURIComponent(id)}/bookmark`,
  );
}

export function unbookmarkPost(id: string) {
  return apiClient.delete<BookmarkState>(
    `/posts/${encodeURIComponent(id)}/bookmark`,
  );
}

export interface FeatureState {
  featured: boolean;
}

export function featurePost(id: string) {
  return apiClient.post<FeatureState>(
    `/posts/${encodeURIComponent(id)}/feature`,
  );
}

export function unfeaturePost(id: string) {
  return apiClient.delete<FeatureState>(
    `/posts/${encodeURIComponent(id)}/feature`,
  );
}

export function hidePost(id: string) {
  return apiClient.post<Post>(`/posts/${encodeURIComponent(id)}/hide`);
}

export function unhidePost(id: string) {
  return apiClient.post<Post>(`/posts/${encodeURIComponent(id)}/unhide`);
}

export interface ListAdminPostsParams {
  page?: number;
  pageSize?: number;
  status?: Extract<PostStatus, "hidden" | "published">;
  featured?: boolean;
  q?: string;
}

/** 管理后台内容审核队列（仅 admin）。 */
export function listAdminPosts(params: ListAdminPostsParams = {}) {
  return apiClient.get<PaginatedData<Post>>("/admin/posts", {
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      status: params.status ?? "hidden",
      featured: params.featured,
      q: params.q,
    },
  });
}
