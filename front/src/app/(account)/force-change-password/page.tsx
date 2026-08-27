"use client";

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
  changePasswordFormSchema,
  zodFieldErrors,
} from "@/lib/auth-schemas";
import { changeMyPassword } from "@/services/community/users";

export default function ForceChangePasswordPage() {
  const { user, status, refreshUser, logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/force-change-password");
      return;
    }
    if (status === "authenticated" && user && !user.mustChangePassword) {
      router.replace("/community");
    }
  }, [status, user, router]);

  if (status === "loading" || !user) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="h-40 w-full max-w-md animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = changePasswordFormSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      await changeMyPassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      // 改密会吊销会话；重新登录提示
      try {
        await logout();
      } catch {
        // ignore
      }
      router.replace(
        `/login?next=/community&notice=${encodeURIComponent("密码已更新，请使用新密码登录")}`,
      );
    } catch (cause) {
      const apiFields = formatApiFieldErrors(cause);
      if (Object.keys(apiFields).length > 0) {
        setFieldErrors(apiFields);
      }
      setError(formatApiErrorMessage(cause, "修改失败，请稍后重试"));
      setSubmitting(false);
      // 若会话仍在，刷新用户状态
      try {
        await refreshUser();
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            请先修改密码
          </h1>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
            管理员为你重置了临时密码。为保障账号安全，必须设置新密码后才能继续使用社区。
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 sm:p-8"
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

          <p className="text-[12px] text-muted-foreground">{PASSWORD_HINT}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">当前临时密码</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              disabled={submitting}
            />
            {fieldErrors.currentPassword ? (
              <p className="text-[12px] text-destructive">
                {fieldErrors.currentPassword}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              disabled={submitting}
            />
            {fieldErrors.newPassword ? (
              <p className="text-[12px] text-destructive">
                {fieldErrors.newPassword}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              disabled={submitting}
            />
            {fieldErrors.confirmPassword ? (
              <p className="text-[12px] text-destructive">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? "保存中…" : "保存并重新登录"}
          </Button>
        </form>
      </div>
    </div>
  );
}
