import { apiClient } from "@/services/api/client";
import {
  clearSession,
  setAccessToken,
} from "@/services/api/auth-store";
import { ApiClientError } from "@/services/api/errors";
import type {
  AuthResult,
  CurrentUser,
  LoginInput,
  RegisterInput,
} from "@/types/user";

export async function register(input: RegisterInput): Promise<AuthResult> {
  const result = await apiClient.post<AuthResult>("/auth/register", input, {
    skipAuth: true,
  });
  setAccessToken(result.tokens.accessToken);
  return result;
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const result = await apiClient.post<AuthResult>("/auth/login", input, {
    skipAuth: true,
  });
  setAccessToken(result.tokens.accessToken);
  return result;
}

export async function logout(): Promise<void> {
  try {
    // HttpOnly refresh Cookie 由浏览器自动携带；access 用于服务端黑名单。
    await apiClient.post<null>("/auth/logout");
  } finally {
    clearSession();
  }
}

export async function refreshSession(): Promise<CurrentUser> {
  const refreshed = await apiClient.refreshAccessToken();
  if (!refreshed) {
    throw new ApiClientError("登录状态已失效，请重新登录", {
      code: 401000,
      status: 401,
    });
  }
  return getCurrentUser();
}

export function getCurrentUser(): Promise<CurrentUser> {
  return apiClient.get<CurrentUser>("/users/me");
}
