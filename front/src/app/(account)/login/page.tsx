"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatApiErrorMessage,
  formatApiFieldErrors,
} from "@/lib/api-validation";
import { loginFormSchema, zodFieldErrors } from "@/lib/auth-schemas";
import { ApiClientError } from "@/services/api/errors";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/community";
  }
  return raw;
}

/** 账号存在但尚未设置密码（知识星球迁入等）。 */
const NO_PASSWORD_CODE = 401004;

function LoginForm() {
  const { login, status, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const notice = searchParams.get("notice");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (user.mustChangePassword) {
      router.replace("/force-change-password");
      return;
    }
    router.replace(nextPath);
  }, [status, user, router, nextPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = loginFormSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({
        identifier: parsed.data.identifier,
        password: parsed.data.password,
      });
      if (result.user.mustChangePassword) {
        router.replace("/force-change-password");
      } else {
        router.replace(nextPath);
      }
    } catch (cause) {
      const apiFields = formatApiFieldErrors(cause);
      if (Object.keys(apiFields).length > 0) {
        setFieldErrors(apiFields);
      }
      if (cause instanceof ApiClientError && cause.code === NO_PASSWORD_CODE) {
        setError(
          "该账号尚未设置密码。请联系管理员在「用户管理」中重置密码，再用临时密码登录并立即修改。",
        );
      } else {
        setError(formatApiErrorMessage(cause, "登录失败，请稍后重试"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            欢迎回岛
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            登录以继续你的新岛旅程
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-[0_16px_50px_rgba(21,23,25,0.06)] sm:p-8"
          noValidate
        >
          {notice ? (
            <p
              role="status"
              className="rounded-xl border border-border bg-secondary/50 px-3.5 py-2.5 text-[13px] text-foreground"
            >
              {notice}
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[13px] text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identifier">用户名或邮箱</Label>
            <Input
              id="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setFieldErrors((prev) => {
                  if (!prev.identifier) return prev;
                  const next = { ...prev };
                  delete next.identifier;
                  return next;
                });
              }}
              placeholder="leo 或 leo@novaisland.ai"
              aria-invalid={Boolean(fieldErrors.identifier)}
              required
            />
            {fieldErrors.identifier ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.identifier}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((prev) => {
                  if (!prev.password) return prev;
                  const next = { ...prev };
                  delete next.password;
                  return next;
                });
              }}
              placeholder="请输入密码"
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            {fieldErrors.password ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            disabled={submitting}
          >
            {submitting ? "登录中……" : "登录"}
          </Button>

          <p className="text-[12px] leading-5 text-muted-foreground">
            忘记密码？暂不支持自助找回，请通过页脚{" "}
            <a
              href="#contact"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              联系领航员
            </a>
            。
          </p>
        </form>

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          还不是岛民？{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            立即加入
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="h-64 w-full max-w-[400px] animate-pulse rounded-3xl bg-muted" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
