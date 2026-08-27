"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserAdminPanel } from "@/components/admin/UserAdminPanel";
import { useAuth } from "@/components/auth/AuthProvider";
import { Pagination } from "@/components/community/Pagination";
import { ListSkeleton } from "@/components/community/skeletons";
import { InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { withQuery } from "@/lib/format";
import { ApiClientError } from "@/services/api/errors";
import {
  listUsers,
  type AdminPasswordState,
} from "@/services/community/users";
import type { AdminUserProfile } from "@/types/user";

const PAGE_SIZE = 10;

const passwordFilters: { value: AdminPasswordState | ""; label: string }[] = [
  { value: "", label: "全部密码状态" },
  { value: "unset", label: "未设密码" },
  { value: "temporary", label: "临时密码待改" },
  { value: "set", label: "已设正式密码" },
];

const roleLabels: Record<string, string> = {
  admin: "管理员",
  moderator: "领航员",
  member: "岛民",
};

const statusLabels: Record<string, string> = {
  active: "正常",
  suspended: "已停用",
  deactivated: "已注销",
};

function AdminUsersContent() {
  const { user: me } = useAuth();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const qParam = searchParams.get("q")?.trim() ?? "";
  const passwordParam = (searchParams.get("password") ?? "") as
    | AdminPasswordState
    | "";

  const [query, setQuery] = useState(qParam);
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers({
        page,
        pageSize: PAGE_SIZE,
        q: qParam || undefined,
        passwordState: passwordParam || undefined,
      });
      setUsers(data.items);
      setTotalPages(data.pagination.totalPages);
      setSelected((prev) => {
        if (qParam) {
          const exact = data.items.find(
            (item) => item.username.toLowerCase() === qParam.toLowerCase(),
          );
          if (exact) return exact;
        }
        if (!prev) return data.items[0] ?? null;
        return (
          data.items.find((item) => item.id === prev.id) ??
          data.items[0] ??
          null
        );
      });
    } catch (cause) {
      setUsers([]);
      setSelected(null);
      setError(
        cause instanceof ApiClientError ? cause.message : "加载用户列表失败",
      );
    } finally {
      setLoading(false);
    }
  }, [page, qParam, passwordParam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setQuery(qParam);
  }, [qParam]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    window.location.assign(
      withQuery("/admin/users", {
        q: next || undefined,
        password: passwordParam || undefined,
        page: 1,
      }),
    );
  };

  const onPasswordFilter = (value: string) => {
    window.location.assign(
      withQuery("/admin/users", {
        q: qParam || undefined,
        password: value || undefined,
        page: 1,
      }),
    );
  };

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            onSubmit={onSearch}
            className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row"
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索用户名或昵称"
              aria-label="搜索用户"
            />
            <select
              value={passwordParam}
              onChange={(event) => onPasswordFilter(event.target.value)}
              aria-label="按密码状态筛选"
              className="h-10 shrink-0 rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {passwordFilters.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" className="shrink-0">
              搜索
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            aria-expanded={creating}
            onClick={() => {
              setCreating((open) => !open);
              setCreateNotice(null);
            }}
          >
            {creating ? "收起表单" : "添加用户"}
          </Button>
        </div>

        {createNotice ? (
          <p role="status" className="mt-3 text-[12px] text-muted-foreground">
            {createNotice}
          </p>
        ) : null}

        {creating ? (
          <div className="mt-4">
            <CreateUserForm
              onCancel={() => setCreating(false)}
              onCreated={(user) => {
                setCreating(false);
                setCreateNotice(`已创建 @${user.username}`);
                setUsers((prev) => [
                  user,
                  ...prev.filter((item) => item.id !== user.id),
                ]);
                setSelected(user);
              }}
            />
          </div>
        ) : null}

        <div className="mt-5">
          {loading ? (
            <ListSkeleton count={5} />
          ) : error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          ) : users.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="size-6" />}
              title="没有匹配的用户"
              description="换个关键词试试，或清空搜索查看全部。也可点「添加用户」代建账号。"
            />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-card">
                {users.map((user) => {
                  const active = selected?.id === user.id;
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(user)}
                        className={
                          active
                            ? "flex w-full items-center gap-3 bg-secondary/70 px-5 py-4 text-left"
                            : "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/50"
                        }
                      >
                        <Avatar
                          src={user.avatarUrl}
                          name={user.displayName}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-foreground">
                            {user.displayName}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground">
                            @{user.username}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="muted">
                            {roleLabels[user.role] ?? user.role}
                          </Badge>
                          {!user.hasPassword ? (
                            <Badge variant="accent">未设密码</Badge>
                          ) : user.mustChangePassword ? (
                            <Badge variant="accent">待改临时密码</Badge>
                          ) : null}
                          <span className="text-[11px] text-muted-foreground">
                            {statusLabels[user.status] ?? user.status}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pagination
                page={page}
                totalPages={totalPages}
                hrefForPage={(p) =>
                  withQuery("/admin/users", {
                    page: p,
                    q: qParam || undefined,
                    password: passwordParam || undefined,
                  })
                }
                className="pt-6"
              />
            </>
          )}
        </div>
      </div>

      <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        {selected ? (
          <div className="space-y-3">
            <UserAdminPanel
              key={`${selected.id}-${selected.role}-${selected.status}-${selected.username}-${selected.temporaryPassword ?? ""}-${selected.mustChangePassword}`}
              profile={selected}
              isSelf={me?.id === selected.id}
              onUpdated={(next) => {
                setSelected(next);
                setUsers((prev) =>
                  prev.map((item) =>
                    item.id === next.id ? { ...item, ...next } : item,
                  ),
                );
              }}
              onDeleted={(next) => {
                setCreateNotice(`已删除原账号，现为 @${next.username}`);
                setSelected(next);
                setUsers((prev) =>
                  prev.map((item) =>
                    item.id === next.id ? { ...item, ...next } : item,
                  ),
                );
              }}
            />
            <p className="text-[12px] text-muted-foreground">
              可在右侧改角色、停用或删除。查看公开内容可打开
              <Link
                href={`/u/${selected.username}`}
                className="mx-1 underline underline-offset-2 hover:text-foreground"
              >
                个人主页
              </Link>
              。
            </p>
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-border bg-secondary/30 p-6 text-[13px] text-muted-foreground">
            从左侧选择一位用户，即可调整角色或停用账号；也可点「添加用户」代建。
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full rounded-[20px]" />
        </div>
      }
    >
      <AdminUsersContent />
    </Suspense>
  );
}
