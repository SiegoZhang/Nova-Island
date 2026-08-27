import { apiClient } from "@/services/api/client";
import type { AttachmentKind } from "@/types/community";

export interface UploadResult {
  storageKey: string;
  url: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  kind: AttachmentKind;
}

export type UploadPurpose = "default" | "avatar";

/** 上传图片或附件到当前存储后端（本地 / 日后 S3）。 */
export function uploadFile(
  file: File,
  options?: { purpose?: UploadPurpose },
) {
  const body = new FormData();
  body.append("file", file);
  const purpose = options?.purpose ?? "default";
  if (purpose !== "default") {
    body.append("purpose", purpose);
  }
  return apiClient.post<UploadResult>("/uploads", body);
}
