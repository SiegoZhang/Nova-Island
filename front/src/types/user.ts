import type { User } from "@/types/community";

/** 公开用户资料（含浏览者视角的关注/本人状态）。 */
export interface UserProfile extends User {
  isFollowing: boolean;
  isSelf: boolean;
}

/** 管理后台用户资料（含密码激活字段）。 */
export interface AdminUserProfile extends UserProfile {
  hasPassword: boolean;
  mustChangePassword: boolean;
  temporaryPassword: string | null;
}

/** 当前登录用户，额外包含私有字段。 */
export interface CurrentUser extends UserProfile {
  email: string | null;
  mustChangePassword: boolean;
}

export interface AuthTokens {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthResult {
  user: CurrentUser;
  tokens: AuthTokens;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface FollowState {
  following: boolean;
  followerCount: number;
}
