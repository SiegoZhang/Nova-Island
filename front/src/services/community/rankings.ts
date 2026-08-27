import {
  apiClient,
  type ApiRequestOptions,
} from "@/services/api/client";
import type { RankingEntry } from "@/types/community";

export interface ListRankingsParams {
  period?: "weekly" | "monthly" | "all";
}

/** 榜单需登录；Server Component 请传入 serverApiOptions()。 */
export function listRankings(
  params: ListRankingsParams = {},
  options: ApiRequestOptions = {},
) {
  return apiClient.get<RankingEntry[]>("/rankings", {
    ...options,
    query: { period: params.period ?? "weekly" },
  });
}
