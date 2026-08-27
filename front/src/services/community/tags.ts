import {
  apiClient,
  type ApiRequestOptions,
} from "@/services/api/client";
import type { PaginatedData } from "@/types/api";
import type { ISODateString } from "@/types/community";

export interface TagItem {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** 发帖用标签库（仅库内名称可选）。 */
export function listTagLibrary(options: ApiRequestOptions = {}) {
  return apiClient.get<TagItem[]>("/tags", options);
}

export function listManageTags(
  params: { page?: number; pageSize?: number; q?: string } = {},
) {
  return apiClient.get<PaginatedData<TagItem>>("/tags/manage", {
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
      q: params.q,
    },
  });
}

export function createTag(input: { name: string; sortOrder?: number }) {
  return apiClient.post<TagItem>("/tags", {
    name: input.name,
    sortOrder: input.sortOrder ?? 0,
  });
}

export function updateTag(
  id: string,
  input: { name?: string; sortOrder?: number },
) {
  return apiClient.patch<TagItem>(`/tags/${encodeURIComponent(id)}`, input);
}

export function deleteTag(id: string) {
  return apiClient.delete<null>(`/tags/${encodeURIComponent(id)}`);
}
