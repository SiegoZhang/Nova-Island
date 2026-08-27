import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/services/api/auth-store";
import { ApiClientError } from "@/services/api/errors";
import type { ApiErrorResponse, ApiResponse } from "@/types/api";
import type { AuthResult } from "@/types/user";

type Fetcher = typeof fetch;

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | object | null;
  query?: Record<string, boolean | number | string | null | undefined>;
  /** 跳过 Authorization 注入与 401 自动刷新（用于登录/注册/刷新自身）。 */
  skipAuth?: boolean;
  /** 内部标记：已因 401 重试过一次，避免死循环。 */
  __isRetry?: boolean;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
}

const DEFAULT_BROWSER_API_BASE_URL = "/api/v1";
const DEFAULT_SERVER_API_BASE_URL = "http://localhost:8000/api/v1";

function resolveBaseUrl(baseUrl?: string): string {
  const configuredBaseUrl =
    baseUrl ??
    (typeof window === "undefined"
      ? process.env.API_INTERNAL_BASE_URL ??
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        DEFAULT_SERVER_API_BASE_URL
      : process.env.NEXT_PUBLIC_API_BASE_URL ??
        DEFAULT_BROWSER_API_BASE_URL);
  return configuredBaseUrl.replace(/\/+$/, "");
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: ApiRequestOptions["query"],
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const absolute = /^https?:\/\//i.test(baseUrl);
  const url = new URL(
    `${baseUrl}${normalizedPath}`,
    absolute ? undefined : "http://next.internal",
  );

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return absolute ? url.toString() : `${url.pathname}${url.search}`;
}

function isBodyInit(body: ApiRequestOptions["body"]): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ApiResponse<unknown>>;
  return (
    typeof candidate.code === "number" &&
    typeof candidate.message === "string" &&
    "data" in candidate &&
    typeof candidate.timestamp === "string"
  );
}

function unrecognizedResponseMessage(status: number): string {
  if (status === 0) {
    return "网络连接失败，请稍后重试";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "服务暂时不可用，请确认后端已启动后重试";
  }
  if (status >= 500) {
    return "服务异常，请稍后重试";
  }
  if (status === 404) {
    return "接口不存在或服务未就绪，请确认后端已启动";
  }
  // 常见于后端未启动时代理返回 HTML / 空响应
  return "无法连接服务，请确认后端已启动后重试";
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;

  let refreshPromise: Promise<boolean> | null = null;

  async function doRefresh(): Promise<boolean> {
    try {
      const response = await fetcher(buildUrl(baseUrl, "/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
      });
      const payload = (await parseJson(response)) as ApiResponse<AuthResult> | null;

      if (!response.ok || !payload || payload.code !== 0) {
        clearAccessToken();
        return false;
      }
      setAccessToken(payload.data.tokens.accessToken);
      return true;
    } catch {
      clearAccessToken();
      return false;
    }
  }

  async function doRefreshWithBrowserLock(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.locks) {
      return doRefresh();
    }
    const result = await navigator.locks.request("nova.auth.refresh", () =>
      doRefresh(),
    );
    return result;
  }

  function ensureRefreshed(): Promise<boolean> {
    if (!refreshPromise) {
      refreshPromise = doRefreshWithBrowserLock().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function request<T>(
    path: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    const {
      body,
      headers: initialHeaders,
      query,
      skipAuth,
      __isRetry,
      ...init
    } = requestOptions;
    const headers = new Headers(initialHeaders);
    const serializedBody =
      body === null || body === undefined || isBodyInit(body)
        ? body
        : JSON.stringify(body);

    if (
      serializedBody !== null &&
      serializedBody !== undefined &&
      !(serializedBody instanceof FormData) &&
      !headers.has("content-type")
    ) {
      headers.set("content-type", "application/json");
    }

    headers.set("accept", "application/json");

    if (!skipAuth) {
      const accessToken = getAccessToken();
      if (accessToken && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${accessToken}`);
      }
    }

    let response: Response;
    try {
      response = await fetcher(buildUrl(baseUrl, path, query), {
        ...init,
        // App Router 默认缓存 GET；社区列表/详情需要新鲜数据
        cache: init.cache ?? "no-store",
        body: serializedBody,
        credentials: init.credentials ?? "include",
        headers,
      });
    } catch (cause) {
      throw new ApiClientError("网络连接失败，请稍后重试", {
        code: -1,
        status: 0,
        cause,
      });
    }

    // access token 过期：单次刷新后重试
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !skipAuth &&
      !__isRetry
    ) {
      const refreshed = await ensureRefreshed();
      if (refreshed) {
        return request<T>(path, { ...requestOptions, __isRetry: true });
      }
    }

    const payload = await parseJson(response);

    if (!isApiResponse(payload)) {
      throw new ApiClientError(unrecognizedResponseMessage(response.status), {
        code: -2,
        status: response.status,
        details: payload,
      });
    }

    if (!response.ok || payload.code !== 0) {
      const errorPayload = payload as ApiErrorResponse;
      throw new ApiClientError(payload.message || "请求失败", {
        code: payload.code,
        status: response.status,
        details: errorPayload.data?.details ?? null,
      });
    }

    return payload.data as T;
  }

  return {
    request,
    refreshAccessToken: ensureRefreshed,
    get: <T>(path: string, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: "GET" }),
    post: <T>(
      path: string,
      body?: ApiRequestOptions["body"],
      options?: ApiRequestOptions,
    ) => request<T>(path, { ...options, body, method: "POST" }),
    patch: <T>(
      path: string,
      body?: ApiRequestOptions["body"],
      options?: ApiRequestOptions,
    ) => request<T>(path, { ...options, body, method: "PATCH" }),
    delete: <T>(path: string, options?: ApiRequestOptions) =>
      request<T>(path, { ...options, method: "DELETE" }),
  };
}

export const apiClient = createApiClient();
