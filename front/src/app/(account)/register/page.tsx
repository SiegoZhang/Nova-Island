"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatApiErrorMessage,
  formatApiFieldErrors,
} from "@/lib/api-validation";
import {
  PASSWORD_HINT,
  registerFormSchema,
  zodFieldErrors,
} from "@/lib/auth-schemas";

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/community");
    }
  }, [status, router]);

  const update = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = registerFormSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const displayName = parsed.data.displayName?.trim();
      await register({
        username: parsed.data.username,
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: displayName || undefined,
      });
      router.replace("/community");
    } catch (cause) {
      const apiFields = formatApiFieldErrors(cause);
      if (Object.keys(apiFields).length > 0) {
        setFieldErrors(apiFields);
      }
      setError(formatApiErrorMessage(cause, "注册失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            加入新岛
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            成为 AI 原住民，与更早行动的人同行
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-[0_16px_50px_rgba(21,23,25,0.06)] sm:p-8"
          noValidate
        >
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[13px] text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">昵称</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(event) => update("displayName")(event.target.value)}
              placeholder="展示给其他岛民的名字"
              maxLength={64}
              aria-invalid={Boolean(fieldErrors.displayName)}
            />
            <p className="text-[12px] text-muted-foreground">
              可选；不填时默认与用户名相同
            </p>
            {fieldErrors.displayName ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.displayName}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(event) => update("username")(event.target.value)}
              placeholder="例如 nova_island"
              autoComplete="username"
              aria-invalid={Boolean(fieldErrors.username)}
              required
            />
            <p className="text-[12px] text-muted-foreground">
              用于登录与个人主页链接；字母、数字或下划线，3–32 位
            </p>
            {fieldErrors.username ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.username}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => update("email")(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
              required
            />
            {fieldErrors.email ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => update("password")(event.target.value)}
              placeholder="设置登录密码"
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            <p className="text-[12px] text-muted-foreground">{PASSWORD_HINT}</p>
            {fieldErrors.password ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(event) =>
                update("confirmPassword")(event.target.value)
              }
              placeholder="再输入一次密码"
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              required
            />
            {fieldErrors.confirmPassword ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            disabled={submitting}
          >
            {submitting ? "创建中……" : "创建账号"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          已经是岛民？{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
