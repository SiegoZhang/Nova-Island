import { apiClient } from "@/services/api/client";
import { publicDirectoryRequestOptions } from "@/services/api/cache";
import type { CommunityEvent } from "@/types/community";

export function listEvents() {
  return apiClient.get<CommunityEvent[]>(
    "/events",
    publicDirectoryRequestOptions,
  );
}
