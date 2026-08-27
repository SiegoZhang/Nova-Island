import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 与后端 `access_cookie_name` 一致；有 Cookie 才允许进入社区内容页。 */
const ACCESS_COOKIE = "nova.access";

/**
 * 未登录禁止浏览社区内容（含帖子、专栏、个人主页帖列表入口）。
 * Cookie 存在但已失效时，由页面内 RequireAuth + 后端 401 兜底。
 */
export function middleware(request: NextRequest) {
  if (request.cookies.get(ACCESS_COOKIE)?.value) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/community/:path*", "/u/:path*"],
};
