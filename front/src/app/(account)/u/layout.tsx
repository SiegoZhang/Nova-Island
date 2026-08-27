import type { ReactNode } from "react";
import { Suspense } from "react";

import { RequireAuth } from "@/components/auth/RequireAuth";
import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/community/skeletons";

function AuthFallback() {
  return (
    <div className="section-container flex flex-1 flex-col gap-8 py-8 md:py-10">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={3} />
    </div>
  );
}

/** 个人主页及关注列表属于社区内容，需登录后查看。 */
export default function UserPublicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<AuthFallback />}>
      <RequireAuth>{children}</RequireAuth>
    </Suspense>
  );
}
