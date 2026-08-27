import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResponse } from "@/types/api";

function jsonResponse<T>(data: T, status = 200): Response {
  const payload: ApiResponse<T> = {
    code: status >= 400 ? 40101 : 0,
    message: status >= 400 ? "认证失败" : "ok",
    data,
    timestamp: "2026-07-29T00:00:00Z",
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

async function loadClient(fetcher: typeof fetch) {
  vi.resetModules();
  vi.stubGlobal("window", {
    localStorage: createStorage({
      "nova.accessToken": "legacy-access",
      "nova.refreshToken": "legacy-refresh",
    }),
  });
  const { setAccessToken } = await import("@/services/api/auth-store");
  setAccessToken("old-access");
  const { createApiClient } = await import("@/services/api/client");
  return createApiClient({
    baseUrl: "https://api.example.test/api/v1",
    fetcher,
  });
}

describe("apiClient token refresh", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("401 后刷新 token，并用新 access token 重试原请求一次", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          tokens: {
            accessToken: "new-access",
            tokenType: "Bearer",
            expiresIn: 3600,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: "success" }));
    const client = await loadClient(fetcher);

    await expect(client.get<{ value: string }>("/protected")).resolves.toEqual({
      value: "success",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);

    const firstHeaders = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    const retryHeaders = fetcher.mock.calls[2]?.[1]?.headers as Headers;
    expect(firstHeaders.get("authorization")).toBe("Bearer old-access");
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v1/auth/refresh",
    );
    expect(fetcher.mock.calls[1]?.[1]?.credentials).toBe("include");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(retryHeaders.get("authorization")).toBe("Bearer new-access");
  });

  it("并发 401 共享同一次刷新请求", async () => {
    let releaseRefresh: (() => void) | undefined;
    const refreshBarrier = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshCount = 0;

    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const headers = init?.headers as Headers;

      if (url.endsWith("/auth/refresh")) {
        refreshCount += 1;
        await refreshBarrier;
        return jsonResponse({
          tokens: {
            accessToken: "new-access",
            tokenType: "Bearer",
            expiresIn: 3600,
          },
        });
      }

      if (headers.get("authorization") === "Bearer old-access") {
        return jsonResponse(null, 401);
      }

      return jsonResponse({ path: new URL(url).pathname });
    });
    const client = await loadClient(fetcher);

    const first = client.get<{ path: string }>("/protected/one");
    const second = client.get<{ path: string }>("/protected/two");
    await vi.waitFor(() => expect(refreshCount).toBe(1));
    releaseRefresh?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { path: "/api/v1/protected/one" },
      { path: "/api/v1/protected/two" },
    ]);
    expect(refreshCount).toBe(1);
  });

  it("支持 Web Locks 时在跨标签页刷新锁内轮换 Cookie", async () => {
    const requestLock = vi.fn(
      async (_name: string, callback: () => Promise<boolean>) => callback(),
    );
    vi.stubGlobal("navigator", { locks: { request: requestLock } });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          tokens: {
            accessToken: "new-access",
            tokenType: "Bearer",
            expiresIn: 3600,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: "success" }));
    const client = await loadClient(fetcher);

    await client.get("/protected");

    expect(requestLock).toHaveBeenCalledTimes(1);
    expect(requestLock.mock.calls[0]?.[0]).toBe("nova.auth.refresh");
  });

  it("重试仍为 401 时不再次刷新，避免无限循环", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(null, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          tokens: {
            accessToken: "new-access",
            tokenType: "Bearer",
            expiresIn: 3600,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 401));
    const client = await loadClient(fetcher);

    await expect(client.get("/protected")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("浏览器支持同源相对 API 地址", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ ok: true }),
    );
    vi.resetModules();
    vi.stubGlobal("window", { localStorage: createStorage({}) });
    const { createApiClient } = await import("@/services/api/client");
    const client = createApiClient({ baseUrl: "/api/v1", fetcher });

    await client.get("/health", { query: { source: "browser" } });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/v1/health?source=browser",
    );
  });

  it("服务端 401 不执行浏览器 Cookie 刷新", async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(null, 401),
    );
    const { createApiClient } = await import("@/services/api/client");
    const client = createApiClient({
      baseUrl: "http://backend.internal/api/v1",
      fetcher,
    });

    await expect(client.get("/protected")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("非 JSON 响应给出可操作的友好提示", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );
    const client = await loadClient(fetcher);

    await expect(client.get("/health")).rejects.toMatchObject({
      name: "ApiClientError",
      status: 502,
      message: "服务暂时不可用，请确认后端已启动后重试",
    });
  });
});
