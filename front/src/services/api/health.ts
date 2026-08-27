import { apiClient } from "@/services/api/client";

export interface HealthData {
  status: "ok";
  service: string;
  version: string;
}

export function getApiHealth() {
  return apiClient.get<HealthData>("/health");
}
