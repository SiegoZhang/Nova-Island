import type { NotificationItem, NotificationType } from "@/types/notification";

const TYPE_LABELS: Record<NotificationType, string> = {
  post_like: "赞了你的帖子",
  comment: "评论了你的帖子",
  reply: "回复了你的评论",
  follow: "关注了你",
};

export function notificationMessage(item: NotificationItem): string {
  return TYPE_LABELS[item.type] ?? "与你有新互动";
}

export function notificationHref(item: NotificationItem): string {
  if (item.type === "follow") {
    return `/u/${item.actor.username}`;
  }
  if (item.postId) {
    return `/community/${item.postId}`;
  }
  return `/u/${item.actor.username}`;
}
