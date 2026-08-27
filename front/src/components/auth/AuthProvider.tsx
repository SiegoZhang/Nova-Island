"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  getAccessToken,
  subscribe,
} from "@/services/api/auth-store";
import * as authService from "@/services/auth";
import type {
  AuthResult,
  CurrentUser,
  LoginInput,
  RegisterInput,
} from "@/types/user";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: CurrentUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthResult>;
  register: (input: RegisterInput) => Promise<AuthResult>;
  logout: () => Promise<void>;
  setUser: (user: CurrentUser) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refreshUser = useCallback(async () => {
    try {
      if (!getAccessToken()) {
        const current = await authService.refreshSession();
        setUserState(current);
        setStatus("authenticated");
        return;
      }
      const current = await authService.getCurrentUser();
      setUserState(current);
      setStatus("authenticated");
    } catch {
      setUserState(null);
      setStatus("unauthenticated");
    }
  }, []);

  // 挂载时引导会话：所有 setState 均在 await 之后异步发生
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await authService.refreshSession();
        if (active) {
          setUserState(current);
          setStatus("authenticated");
        }
      } catch {
        if (active) {
          setUserState(null);
          setStatus("unauthenticated");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // access token 被动清除（如 refresh Cookie 失效）时同步登出状态
  useEffect(() => {
    return subscribe(() => {
      if (!getAccessToken()) {
        setUserState(null);
        setStatus("unauthenticated");
      }
    });
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const result = await authService.login(input);
    setUserState(result.user);
    setStatus("authenticated");
    return result;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await authService.register(input);
    setUserState(result.user);
    setStatus("authenticated");
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUserState(null);
    setStatus("unauthenticated");
  }, []);

  const setUser = useCallback((next: CurrentUser) => {
    setUserState(next);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, status, login, register, logout, setUser, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth 必须在 <AuthProvider> 内使用");
  }
  return context;
}
