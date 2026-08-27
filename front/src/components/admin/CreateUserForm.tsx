"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PASSWORD_HINT } from "@/lib/auth-schemas";
import { validateNewPassword } from "@/lib/password-policy";
import { formatApiErrorMessage } from "@/lib/api-validation";
import { createUser } from "@/services/community/users";
import type { UserRole } from "@/types/community";
import type { AdminUserProfile } from "@/types/user";

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "member", label: "岛民" },
  { value: "moderator", label: "领航员" },
  { value: "admin", label: "管理员" },
];

interface CreateUserFormProps {
  onCreated?: (user: AdminUserProfile) => void;
  onCancel?: () => void;
}

export function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (trimmedUsername.length < 3) {
      setError("用户名至少 3 个字符");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      setError("用户名仅支持字母、数字和下划线");
      return;
    }
    if (!trimmedEmail.includes("@")) {
      setError("请填写有效邮箱");
      return;
    }
    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const user = await createUser({
        username: trimmedUsername,
        email: trimmedEmail,
        password,
        displayName: displayName.trim() || undefined,
        role,
      });
      onCreated?.(user);
    } catch (cause) {
      setError(formatApiErrorMessage(cause, "创建用户失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[20px] border border-border bg-card p-5 shadow-[0_8px_28px_rgba(21,23,25,0.04)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            添加用户
          </p>
          <p className="mt-1 text-[14px] font-semibold text-foreground">
            管理员代建账号
          </p>
        </div>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          用户名
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            placeholder="字母数字下划线"
            disabled={busy}
            required
            minLength={3}
            maxLength={32}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          邮箱
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            placeholder="user@example.com"
            disabled={busy}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          初始密码
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder={PASSWORD_HINT}
            disabled={busy}
            required
            minLength={8}
          />
          <span className="text-[11px] leading-4 text-muted-foreground/90">
            {PASSWORD_HINT}
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          昵称（可选）
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
            placeholder="默认与用户名相同"
            disabled={busy}
            maxLength={64}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
          角色
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={busy}
            className="h-10 rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">
          创建后对方可用该账号登录；不会切换你当前的管理员会话。
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        disabled={busy}
        className="mt-4 w-full sm:w-auto"
      >
        {busy ? "创建中……" : "创建用户"}
      </Button>
    </form>
  );
}
