"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Pagination } from "@/components/community/Pagination";
import { ListSkeleton } from "@/components/community/skeletons";
import { TagIcon, InboxIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { withQuery } from "@/lib/format";
import { ApiClientError } from "@/services/api/errors";
import {
  createTag,
  deleteTag,
  listManageTags,
  updateTag,
  type TagItem,
} from "@/services/community/tags";

const PAGE_SIZE = 30;

function AdminTagsContent() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const qParam = searchParams.get("q")?.trim() ?? "";

  const [items, setItems] = useState<TagItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(qParam);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listManageTags({
        page,
        pageSize: PAGE_SIZE,
        q: qParam || undefined,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch (cause) {
      setItems([]);
      setTotalPages(1);
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "标签列表加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, [page, qParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("请填写标签名称");
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      await createTag({ name: trimmed });
      setName("");
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof ApiClientError ? cause.message : "创建失败",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (tag: TagItem) => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === tag.name) {
      setEditingId(null);
      return;
    }
    setBusyId(tag.id);
    setFormError(null);
    try {
      await updateTag(tag.id, { name: trimmed });
      setEditingId(null);
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof ApiClientError ? cause.message : "重命名失败",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (tag: TagItem) => {
    if (
      !window.confirm(
        `删除标签「${tag.name}」？已有帖子上的该标签不会自动清除，但发帖时将不可再选。`,
      )
    ) {
      return;
    }
    setBusyId(tag.id);
    setFormError(null);
    try {
      await deleteTag(tag.id);
      await load();
    } catch (cause) {
      setFormError(
        cause instanceof ApiClientError ? cause.message : "删除失败",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          标签库
        </h1>
        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
          仅管理员可维护。发帖时只能从本库点选；旧帖中不在库内的标签会被忽略。
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor="new-tag"
            className="text-[12px] font-medium text-foreground"
          >
            新增标签
          </label>
          <Input
            id="new-tag"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：实战复盘"
            maxLength={64}
            disabled={creating}
            className="mt-1.5"
          />
        </div>
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? "创建中…" : "添加"}
        </Button>
      </form>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          window.location.href = withQuery("/admin/tags", {
            q: query.trim() || undefined,
            page: 1,
          });
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标签"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" size="sm">
          搜索
        </Button>
      </form>

      {formError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/8 px-3.5 py-2.5 text-[13px] text-destructive"
        >
          {formError}
        </p>
      ) : null}

      {loading ? (
        <ListSkeleton count={5} />
      ) : error ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="加载失败"
          description={error}
          action={
            <Button type="button" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="size-6" />}
          title="暂无标签"
          description={
            qParam ? "没有匹配的标签，试试清空搜索。" : "先添加几个常用标签吧。"
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {items.map((tag) => {
              const busy = busyId === tag.id;
              const editing = editingId === tag.id;
              return (
                <li
                  key={tag.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  {editing ? (
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      maxLength={64}
                      disabled={busy}
                      className="max-w-xs"
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleRename(tag);
                        }
                        if (event.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <div>
                      <p className="text-[14px] font-medium text-foreground">
                        {tag.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        排序 {tag.sortOrder}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {editing ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleRename(tag)}
                        >
                          保存
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditName(tag.name);
                          }}
                        >
                          重命名
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleDelete(tag)}
                        >
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            hrefForPage={(p) =>
              withQuery("/admin/tags", {
                page: p,
                q: qParam || undefined,
              })
            }
          />
        </>
      )}
    </div>
  );
}

export default function AdminTagsPage() {
  return (
    <Suspense fallback={<ListSkeleton count={5} />}>
      <AdminTagsContent />
    </Suspense>
  );
}
