import Link from "next/link";

import { AdminComingSoon } from "@/components/admin/AdminComingSoon";
import { Card } from "@/components/ui/card";

export default function AdminOperationsPage() {
  return (
    <div className="space-y-6">
      <AdminComingSoon
        title="活动与航海运营后台暂未开放"
        description="报名、席位与航海班期管理尚未设计数据表。前台相关按钮已禁用并标明「暂未开放」，避免假操作。"
        action={
          <Link
            href="/community/events"
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card/60 px-5 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card"
          >
            查看活动前台
          </Link>
        }
      />

      <Card
        id="billing"
        className="scroll-mt-28 border-dashed p-5 sm:p-6"
      >
        <p className="text-[12px] font-medium text-muted-foreground">支付与会员</p>
        <h2 className="mt-2 text-[16px] font-semibold text-foreground">
          付费登岛通道明确延后
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
          年费展示与 FAQ 已说明「付费暂未开通」。当前用户可免费注册并使用社区基础功能；支付订单、会员权益表与结算流程不在本阶段范围。
        </p>
      </Card>
    </div>
  );
}
