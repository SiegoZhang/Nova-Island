import type { EntityId, ISODateString, UserSummary } from "@/types/community";

export type NotificationType = "post_like" | "comment" | "reply" | "follow";

export interface NotificationItem {
  id: EntityId;
  type: NotificationType;
  actor: UserSummary;
  postId: EntityId | null;
  commentId: EntityId | null;
  readAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
