import {
  apiClient,
  type ApiRequestOptions,
} from "@/services/api/client";
import type { PaginatedData } from "@/types/api";
import type { Comment } from "@/types/community";
import type { LikeState } from "@/services/community/posts";

export interface ListCommentsParams {
  page?: number;
  pageSize?: number;
}

export interface CreateCommentInput {
  content: string;
  parentId?: string | null;
}

export function listComments(
  postId: string,
  params: ListCommentsParams = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<PaginatedData<Comment>>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    {
      ...options,
      query: {
        ...options.query,
        page: params.page ?? 1,
        page_size: params.pageSize ?? 20,
      },
    },
  );
}

export function createComment(postId: string, input: CreateCommentInput) {
  return apiClient.post<Comment>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    {
      content: input.content,
      parentId: input.parentId ?? null,
    },
  );
}

export function updateComment(
  postId: string,
  commentId: string,
  content: string,
) {
  return apiClient.patch<Comment>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    { content },
  );
}

export function deleteComment(postId: string, commentId: string) {
  return apiClient.delete<null>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
  );
}

export function likeComment(postId: string, commentId: string) {
  return apiClient.post<LikeState>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
  );
}

export function unlikeComment(postId: string, commentId: string) {
  return apiClient.delete<LikeState>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
  );
}
