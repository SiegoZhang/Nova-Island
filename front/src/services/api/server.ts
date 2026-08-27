import "server-only";

import { cookies } from "next/headers";

import type { ApiRequestOptions } from "@/services/api/client";

/**
 * Server Component 调后端只读接口时，显式转发浏览器发给 Next 的 Cookie。
 *
 * 此文件带有 `server-only`，不能被 Client Component 引入。后端也只允许
 * access Cookie 认证 GET/HEAD；写请求仍必须使用 Bearer token。
 */
export async function serverApiOptions(): Promise<ApiRequestOptions> {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader ? { headers: { cookie: cookieHeader } } : {};
}
