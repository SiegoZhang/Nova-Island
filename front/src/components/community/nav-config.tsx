import type { ComponentType, SVGProps } from "react";

import {
  BookIcon,
  CalendarIcon,
  ClockIcon,
  CompassIcon,
  SparkIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";

export interface CommunityNavItem {
  label: string;
  href: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * 社区二级导航（对标 scys.com 的「精华 / 最新 / 航海 / 专栏 / 榜单」栏目分层），
 * 结合新岛 AI 社区语境做本地化改造。href 为真实路由，可直接跳转。
 */
export const communityNavItems: CommunityNavItem[] = [
  {
    label: "精华",
    href: "/community",
    description: "领航员精选的高价值实战复盘",
    icon: SparkIcon,
  },
  {
    label: "最新",
    href: "/community/latest",
    description: "岛民实时动态与讨论信息流",
    icon: ClockIcon,
  },
  {
    label: "关注",
    href: "/community/following",
    description: "你关注的岛民发布的内容",
    icon: UsersIcon,
  },
  {
    label: "航海",
    href: "/community/voyages",
    description: "限时实战项目组，与同行者共创",
    icon: CompassIcon,
  },
  {
    label: "专栏",
    href: "/community/columns",
    description: "垂直主题的系统化连载内容",
    icon: BookIcon,
  },
  {
    label: "榜单",
    href: "/community/ranking",
    description: "本周热度与贡献值排行",
    icon: TrophyIcon,
  },
  {
    label: "活动",
    href: "/community/events",
    description: "线上分享与同城线下见面会",
    icon: CalendarIcon,
  },
];
