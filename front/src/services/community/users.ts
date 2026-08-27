import {
  apiClient,
  type ApiRequestOptions,
} from "@/services/api/client";
import type { PaginatedData } from "@/types/api";
import type { Post, UserSummary } from "@/types/community";
import type {
  AdminUserProfile,
  ChangePasswordInput,
  CurrentUser,
  FollowState,
  UpdateProfileInput,
  UserProfile,
} from "@/types/user";

export function getUserProfile(
  username: string,
  options: ApiRequestOptions = {},
) {
  return apiClient.get<UserProfile>(
    `/users/${encodeURIComponent(username)}`,
    options,
  );
}

export type AdminPasswordState = "unset" | "temporary" | "set";

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  q?: string;
  passwordState?: AdminPasswordState;
}

/** 管理员：分页用户列表。 */
export function listUsers(params: ListUsersParams = {}) {
  return apiClient.get<PaginatedData<AdminUserProfile>>("/users", {
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      q: params.q,
      password_state: params.passwordState,
    },
  });
}

export interface ListUserPostsParams {
  page?: number;
  pageSize?: number;
  featured?: boolean;
}

export function listUserPosts(
  username: string,
  params: ListUserPostsParams = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<PaginatedData<Post>>(
    `/users/${encodeURIComponent(username)}/posts`,
    {
      ...options,
      query: {
        page: params.page ?? 1,
        page_size: params.pageSize ?? 20,
        featured: params.featured,
      },
    },
  );
}

export interface ListUserBookmarksParams {
  page?: number;
  pageSize?: number;
}

/** 公开收藏：任意登录用户可查看。 */
export function listUserBookmarks(
  username: string,
  params: ListUserBookmarksParams = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<PaginatedData<Post>>(
    `/users/${encodeURIComponent(username)}/bookmarks`,
    {
      ...options,
      query: {
        page: params.page ?? 1,
        page_size: params.pageSize ?? 20,
      },
    },
  );
}

export interface ListFollowingPostsParams {
  page?: number;
  pageSize?: number;
}

/** 关注动态：我关注的人发布的帖。 */
export function listFollowingPosts(
  params: ListFollowingPostsParams = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<PaginatedData<Post>>("/users/me/following/posts", {
    ...options,
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
}

export interface ListFollowParams {
  page?: number;
  pageSize?: number;
}

export function listUserFollowers(
  username: string,
  params: ListFollowParams = {},
) {
  return apiClient.get<PaginatedData<UserSummary>>(
    `/users/${encodeURIComponent(username)}/followers`,
    {
      query: {
        page: params.page ?? 1,
        page_size: params.pageSize ?? 20,
      },
    },
  );
}

export function listUserFollowing(
  username: string,
  params: ListFollowParams = {},
) {
  return apiClient.get<PaginatedData<UserSummary>>(
    `/users/${encodeURIComponent(username)}/following`,
    {
      query: {
        page: params.page ?? 1,
        page_size: params.pageSize ?? 20,
      },
    },
  );
}

export function updateMyProfile(input: UpdateProfileInput) {
  return apiClient.patch<CurrentUser>("/users/me", input);
}

export function changeMyPassword(input: ChangePasswordInput) {
  return apiClient.post<null>("/users/me/password", input);
}

export interface ListMyBookmarksParams {
  page?: number;
  pageSize?: number;
}

export function listMyBookmarks(params: ListMyBookmarksParams = {}) {
  return apiClient.get<PaginatedData<Post>>("/users/me/bookmarks", {
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
}

export interface ListMyDraftsParams {
  page?: number;
  pageSize?: number;
}

export function listMyDrafts(params: ListMyDraftsParams = {}) {
  return apiClient.get<PaginatedData<Post>>("/users/me/drafts", {
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
}

export function followUser(username: string) {
  return apiClient.post<FollowState>(
    `/users/${encodeURIComponent(username)}/follow`,
  );
}

export function unfollowUser(username: string) {
  return apiClient.delete<FollowState>(
    `/users/${encodeURIComponent(username)}/follow`,
  );
}

export function updateUserRole(
  username: string,
  role: "member" | "moderator" | "admin",
) {
  return apiClient.patch<AdminUserProfile>(
    `/users/${encodeURIComponent(username)}/role`,
    { role },
  );
}

export function updateUserStatus(
  username: string,
  status: "active" | "suspended" | "deactivated",
) {
  return apiClient.patch<AdminUserProfile>(
    `/users/${encodeURIComponent(username)}/status`,
    { status },
  );
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
  role?: "member" | "moderator" | "admin";
}

/** 管理员代建账号；不签发登录会话。 */
export function createUser(input: CreateUserInput) {
  return apiClient.post<AdminUserProfile>("/users", input);
}

/** 管理员软删除账号。 */
export function deleteUser(username: string) {
  return apiClient.delete<AdminUserProfile>(
    `/users/${encodeURIComponent(username)}`,
  );
}

/** 管理员重置密码（激活 / 忘记密码）；返回含 temporaryPassword 的资料。 */
export function resetUserPassword(username: string) {
  return apiClient.post<AdminUserProfile>(
    `/users/${encodeURIComponent(username)}/password/reset`,
  );
}
