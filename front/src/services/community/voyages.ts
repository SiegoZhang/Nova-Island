import { apiClient } from "@/services/api/client";
import { publicDirectoryRequestOptions } from "@/services/api/cache";
import type { Voyage } from "@/types/community";

export function listVoyages() {
  return apiClient.get<Voyage[]>(
    "/voyages",
    publicDirectoryRequestOptions,
  );
}
