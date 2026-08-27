"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BookIcon,
  CompassIcon,
  GridIcon,
  TagIcon,
  UsersIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const links: {
  href: string;
  label: string;
  exact?: boolean;
  icon: typeof GridIcon;
}[] = [
  { href: "/admin", label: "总览", exact: true, icon: GridIcon },
  { href: "/admin/users", label: "用户管理", icon: UsersIcon },
  { href: "/admin/content", label: "内容运营", icon: BookIcon },
  { href: "/admin/tags", label: "标签", icon: TagIcon },
  { href: "/admin/operations", label: "活动与航海", icon: CompassIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="管理后台导航" className="flex flex-wrap gap-1.5 md:flex-col md:gap-1">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "group inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium transition-[background-color,border-color,color] duration-300 md:w-full md:rounded-xl",
              active
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card/60 text-foreground hover:border-foreground/25 hover:bg-card md:border-transparent md:bg-transparent md:hover:bg-card/80",
            )}
          >
            <link.icon className="size-3.5 shrink-0 opacity-80" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
