import { apiClient } from "@/services/api/client";
import type { PaginatedData } from "@/types/api";
import type { NotificationItem } from "@/types/notification";

export function listNotifications(params: {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
} = {}) {
  return apiClient.get<PaginatedData<NotificationItem>>("/notifications", {
    query: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
      unreadOnly: params.unreadOnly ? true : undefined,
    },
  });
}

export function getUnreadNotificationCount() {
  return apiClient.get<{ count: number }>("/notifications/unread-count");
}

export function markNotificationRead(id: string) {
  return apiClient.post<NotificationItem>(
    `/notifications/${encodeURIComponent(id)}/read`,
  );
}

export function markAllNotificationsRead() {
  return apiClient.post<{ updated: number }>("/notifications/read-all");
}
