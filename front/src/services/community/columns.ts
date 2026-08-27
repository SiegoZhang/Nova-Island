import {
  apiClient,
  type ApiRequestOptions,
} from "@/services/api/client";
import { publicDirectoryRequestOptions } from "@/services/api/cache";
import type { PaginatedData } from "@/types/api";
import type { Column, Post } from "@/types/community";

export function listColumns() {
  return apiClient.get<Column[]>(
    "/columns",
    publicDirectoryRequestOptions,
  );
}

export function getColumn(columnId: string, options?: ApiRequestOptions) {
  return apiClient.get<Column>(`/columns/${columnId}`, {
    ...publicDirectoryRequestOptions,
    ...options,
  });
}

export function listColumnPosts(
  columnId: string,
  params: { page?: number; pageSize?: number } = {},
  options?: ApiRequestOptions,
) {
  return apiClient.get<PaginatedData<Post>>(`/columns/${columnId}/posts`, {
    ...publicDirectoryRequestOptions,
    ...options,
    query: {
      ...options?.query,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
}
