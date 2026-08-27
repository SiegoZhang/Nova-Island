import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  BookIcon,
  CalendarIcon,
  CompassIcon,
  TagIcon,
  UsersIcon,
} from "@/components/icons";

const modules = [
  {
    href: "/admin/users",
    title: "用户管理",
    description: "查看岛民列表，调整角色与账号状态。",
    status: "可用" as const,
    icon: UsersIcon,
  },
  {
    href: "/admin/content",
    title: "内容运营",
    description: "集中处理已隐藏与已发布内容；详情页仍可即时审帖。",
    status: "可用" as const,
    icon: BookIcon,
  },
  {
    href: "/admin/tags",
    title: "标签库",
    description: "维护发帖可选标签；仅库内名称可被点选。",
    status: "可用" as const,
    icon: TagIcon,
  },
  {
    href: "/admin/operations",
    title: "活动与航海",
    description: "运营后台与报名数据表尚未设计，前台入口已诚实禁用。",
    status: "暂未开放" as const,
    icon: CompassIcon,
  },
  {
    href: "/admin/operations#billing",
    title: "支付与会员",
    description: "付费登岛通道明确延后，此处仅作占位说明。",
    status: "暂未开放" as const,
    icon: CalendarIcon,
  },
];

export default function AdminHomePage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map((module) => (
        <Link key={module.href + module.title} href={module.href}>
          <Card className="h-full p-5 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-[0_18px_42px_rgba(21,23,25,0.09)]">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground">
                <module.icon className="size-4" />
              </span>
              <span
                className={
                  module.status === "可用"
                    ? "rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                    : "rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                }
              >
                {module.status}
              </span>
            </div>
            <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.01em] text-foreground">
              {module.title}
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              {module.description}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
