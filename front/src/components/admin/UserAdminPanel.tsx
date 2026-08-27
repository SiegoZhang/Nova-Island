"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/services/api/errors";
import {
  deleteUser,
  resetUserPassword,
  updateUserRole,
  updateUserStatus,
} from "@/services/community/users";
import type { UserRole, UserStatus } from "@/types/community";
import type { AdminUserProfile } from "@/types/user";

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "member", label: "岛民" },
  { value: "moderator", label: "领航员" },
  { value: "admin", label: "管理员" },
];

const statusOptions: { value: UserStatus; label: string }[] = [
  { value: "active", label: "正常" },
  { value: "suspended", label: "已停用" },
  { value: "deactivated", label: "已注销" },
];

interface UserAdminPanelProps {
  profile: AdminUserProfile;
  /** 禁止对自己降权/停用/删除时的提示场景 */
  isSelf?: boolean;
  onUpdated?: (next: AdminUserProfile) => void;
  onDeleted?: (next: AdminUserProfile) => void;
}

export function UserAdminPanel({
  profile,
  isSelf = false,
  onUpdated,
  onDeleted,
}: UserAdminPanelProps) {
  const [role, setRole] = useState<UserRole>(profile.role);
  const [savedRole, setSavedRole] = useState<UserRole>(profile.role);
  const [accountStatus, setAccountStatus] = useState<UserStatus>(
    profile.status,
  );
  const [savedStatus, setSavedStatus] = useState<UserStatus>(profile.status);
  const [busy, setBusy] = useState<
    "role" | "status" | "delete" | "reset" | null
  >(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [visiblePassword, setVisiblePassword] = useState<string | null>(
    profile.temporaryPassword,
  );

  const alreadyDeleted =
    profile.status === "deactivated" &&
    profile.displayName === "已删除用户";

  useEffect(() => {
    setRole(profile.role);
    setSavedRole(profile.role);
    setAccountStatus(profile.status);
    setSavedStatus(profile.status);
    setVisiblePassword(profile.temporaryPassword);
    setFeedback(null);
  }, [
    profile.id,
    profile.role,
    profile.status,
    profile.displayName,
    profile.temporaryPassword,
  ]);

  const saveRole = async () => {
    if (isSelf && role !== "admin") {
      setFeedback({
        type: "error",
        message: "不能取消自己的管理员角色",
      });
      return;
    }
    setBusy("role");
    setFeedback(null);
    try {
      const next = await updateUserRole(profile.username, role);
      setRole(next.role);
      setSavedRole(next.role);
      onUpdated?.(next);
      setFeedback({ type: "success", message: "角色已更新" });
    } catch (cause) {
      setFeedback({
        type: "error",
        message:
          cause instanceof ApiClientError ? cause.message : "更新角色失败",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveStatus = async () => {
    if (isSelf && accountStatus !== "active") {
      setFeedback({
        type: "error",
        message: "不能停用自己的账号",
      });
      return;
    }
    setBusy("status");
    setFeedback(null);
    try {
      const next = await updateUserStatus(profile.username, accountStatus);
      setAccountStatus(next.status);
      setSavedStatus(next.status);
      onUpdated?.(next);
      setFeedback({ type: "success", message: "账号状态已更新" });
    } catch (cause) {
      setFeedback({
        type: "error",
        message:
          cause instanceof ApiClientError ? cause.message : "更新状态失败",
      });
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = async () => {
    if (isSelf) {
      setFeedback({
        type: "error",
        message: "请使用「账号设置」修改自己的密码",
      });
      return;
    }
    if (
      !window.confirm(
        `确认重置 @${profile.username} 的密码？将生成新的临时密码，对方登录后必须立即修改。`,
      )
    ) {
      return;
    }
    setBusy("reset");
    setFeedback(null);
    try {
      const next = await resetUserPassword(profile.username);
      setVisiblePassword(next.temporaryPassword);
      onUpdated?.(next);
      setFeedback({
        type: "success",
        message: "已重置。请将下方临时密码告知用户。",
      });
    } catch (cause) {
      setFeedback({
        type: "error",
        message:
          cause instanceof ApiClientError ? cause.message : "重置密码失败",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeUser = async () => {
    if (isSelf) {
      setFeedback({ type: "error", message: "不能删除自己的账号" });
      return;
    }
    if (
      !window.confirm(
        `确认删除 @${profile.username}？将无法登录，用户名与邮箱可被重新注册；历史内容仍保留署名占位。`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setFeedback(null);
    try {
      const next = await deleteUser(profile.username);
      onDeleted?.(next);
      setFeedback({ type: "success", message: "用户已删除" });
    } catch (cause) {
      setFeedback({
        type: "error",
        message:
          cause instanceof ApiClientError ? cause.message : "删除用户失败",
      });
    } finally {
      setBusy(null);
    }
  };

  const passwordHint = !profile.hasPassword
    ? "未设密码（迁入用户等，需重置后才能登录）"
    : profile.mustChangePassword
      ? "已下发临时密码，等待用户登录后修改"
      : "已设置正式密码";

  return (
    <div className="min-w-0 rounded-[20px] border border-border bg-card p-5 shadow-[0_8px_28px_rgba(21,23,25,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-muted-foreground">
            管理员操作
          </p>
          <p className="mt-1 truncate text-[14px] font-semibold text-foreground">
            {profile.displayName}
            <span className="ml-2 text-[12px] font-normal text-muted-foreground">
              @{profile.username}
            </span>
          </p>
        </div>
        <Link
          href={`/u/${profile.username}`}
          className="shrink-0 text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          查看主页
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3">
        <p className="text-[12px] font-medium text-foreground">密码状态</p>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {passwordHint}
        </p>
        {visiblePassword ? (
          <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              临时密码（用户改密前可反复查看）
            </p>
            <p className="mt-1 break-all font-mono text-[14px] font-semibold tracking-wide text-foreground">
              {visiblePassword}
            </p>
          </div>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null || isSelf || alreadyDeleted}
          onClick={resetPassword}
          className="mt-3"
        >
          {busy === "reset"
            ? "重置中……"
            : isSelf
              ? "不能重置自己"
              : profile.hasPassword
                ? "重置密码"
                : "生成临时密码（激活）"}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-1 xl:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-[12px] text-muted-foreground">
          角色
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={busy !== null || alreadyDeleted}
            className="h-10 w-full min-w-0 rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || role === savedRole || alreadyDeleted}
            onClick={saveRole}
            className="mt-1 w-fit"
          >
            {busy === "role" ? "保存中……" : "保存角色"}
          </Button>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-[12px] text-muted-foreground">
          账号状态
          <select
            value={accountStatus}
            onChange={(event) =>
              setAccountStatus(event.target.value as UserStatus)
            }
            disabled={busy !== null || alreadyDeleted}
            className="h-10 w-full min-w-0 rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={
              busy !== null || accountStatus === savedStatus || alreadyDeleted
            }
            onClick={saveStatus}
            className="mt-1 w-fit"
          >
            {busy === "status" ? "保存中……" : "保存状态"}
          </Button>
        </label>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-[12px] font-medium text-muted-foreground">危险操作</p>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          删除后对方无法登录，用户名与邮箱可再次注册；帖子等历史内容会保留为「已删除用户」。
        </p>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy !== null || isSelf || alreadyDeleted}
          onClick={removeUser}
          className="mt-3"
        >
          {busy === "delete"
            ? "删除中……"
            : alreadyDeleted
              ? "已删除"
              : isSelf
                ? "不能删除自己"
                : "删除用户"}
        </Button>
      </div>

      {feedback ? (
        <p
          role="status"
          className={
            feedback.type === "success"
              ? "mt-3 text-[12px] text-muted-foreground"
              : "mt-3 text-[12px] text-destructive"
          }
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
