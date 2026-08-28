"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/community/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  formatApiErrorMessage,
  formatApiFieldErrors,
} from "@/lib/api-validation";
import {
  PASSWORD_HINT,
  changePasswordFormSchema,
  zodFieldErrors,
} from "@/lib/auth-schemas";
import { uploadFile } from "@/services/community/uploads";
import { changeMyPassword, updateMyProfile } from "@/services/community/users";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

type Feedback = { type: "success" | "error"; message: string } | null;

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio ?? "");
      setAvatarUrl(user.avatarUrl ?? "");
    }
  }, [user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
      });
      setUser(updated);
      setFeedback({ type: "success", message: "资料已更新" });
    } catch (cause) {
      setFeedback({
        type: "error",
        message: formatApiErrorMessage(cause, "更新失败"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
        个人资料
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        昵称与简介会展示在个人主页；用户名用于登录，不可在此修改。
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usernameReadonly">用户名</Label>
            <Input
              id="usernameReadonly"
              value={user?.username ? `@${user.username}` : ""}
              readOnly
              disabled
              className="bg-secondary/50"
            />
            <p className="text-[12px] text-muted-foreground">
              用于登录与主页链接 /u/{user?.username}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emailReadonly">邮箱</Label>
            <Input
              id="emailReadonly"
              value={user?.email ?? "未绑定"}
              readOnly
              disabled
              className="bg-secondary/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Avatar
            src={avatarUrl || user?.avatarUrl}
            name={displayName || user?.username || "U"}
            size={56}
          />
          <div className="flex-1">
            <Label htmlFor="avatarFile">头像</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Input
                id="avatarFile"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploadingAvatar || saving}
                className="max-w-xs cursor-pointer file:mr-3 file:cursor-pointer"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > AVATAR_MAX_BYTES) {
                    setFeedback({
                      type: "error",
                      message: "图片不能超过 5MB",
                    });
                    return;
                  }
                  setFeedback(null);
                  setUploadingAvatar(true);
                  try {
                    const uploaded = await uploadFile(file, {
                      purpose: "avatar",
                    });
                    setAvatarUrl(uploaded.url);
                    setFeedback({
                      type: "success",
                      message: "头像已上传，请点击保存修改",
                    });
                  } catch (cause) {
                    setFeedback({
                      type: "error",
                      message: formatApiErrorMessage(cause, "头像上传失败"),
                    });
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
              />
              {uploadingAvatar ? (
                <span className="text-[12px] text-muted-foreground">
                  上传中……
                </span>
              ) : null}
            </div>
            <Label htmlFor="avatarUrl" className="mt-3 block">
              或粘贴头像链接
            </Label>
            <Input
              id="avatarUrl"
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://... 或 /images/avatar.png"
              className="mt-1.5"
            />
            <p className="mt-1 text-[12px] text-muted-foreground">
              本地上传限 5MB
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">昵称</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={64}
            required
          />
          <p className="text-[12px] text-muted-foreground">
            展示给其他岛民的名字，可随时修改
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bio">个人简介</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={300}
            placeholder="介绍一下你自己……"
          />
          <p className="text-[12px] text-muted-foreground">{bio.length}/300</p>
        </div>

        {feedback ? (
          <p
            role="status"
            className={
              feedback.type === "success"
                ? "text-[13px] text-accent-foreground/80"
                : "text-[13px] text-destructive"
            }
          >
            {feedback.message}
          </p>
        ) : null}

        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "保存中……" : "保存修改"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordSection() {
  const { logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
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

    setSaving(true);
    try {
      await changeMyPassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
    } catch (cause) {
      const apiFields = formatApiFieldErrors(cause);
      if (Object.keys(apiFields).length > 0) {
        setFieldErrors(apiFields);
      }
      setFeedback({
        type: "error",
        message: formatApiErrorMessage(cause, "修改失败"),
      });
      setSaving(false);
      return;
    }

    // 服务端已吊销会话并清 Cookie；登出接口可能因 access 失效而失败，忽略即可
    try {
      await logout();
    } catch {
      // ignore
    }
    router.replace("/login?next=/settings");
  };

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
        修改密码
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {PASSWORD_HINT}。修改成功后需使用新密码重新登录。
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-5"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currentPassword">当前密码</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            aria-invalid={Boolean(fieldErrors.currentPassword)}
            required
          />
          {fieldErrors.currentPassword ? (
            <p className="text-[12px] text-destructive" role="alert">
              {fieldErrors.currentPassword}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.newPassword)}
              required
            />
            <p className="text-[12px] text-muted-foreground">{PASSWORD_HINT}</p>
            {fieldErrors.newPassword ? (
              <p className="text-[12px] text-destructive" role="alert">
                {fieldErrors.newPassword}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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
        </div>

        {feedback ? (
          <p
            role="status"
            className={
              feedback.type === "success"
                ? "text-[13px] text-accent-foreground/80"
                : "text-[13px] text-destructive"
            }
          >
            {feedback.message}
          </p>
        ) : null}

        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "提交中……" : "更新密码"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent("/settings")}`);
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="section-container w-full py-8 md:py-10">
        <Skeleton className="h-9 w-40" />
        <div className="mt-8 flex flex-col gap-6">
          <Skeleton className="h-64 w-full rounded-[24px]" />
          <Skeleton className="h-64 w-full rounded-[24px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="section-container w-full py-8 md:py-10">
      <PageHeader title="账号设置" description="管理你的个人资料与登录安全。" />
      <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-6">
        <ProfileSection />
        <PasswordSection />
      </div>
    </div>
  );
}
