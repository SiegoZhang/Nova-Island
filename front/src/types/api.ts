/**
 * 后端统一响应协议。
 *
 * 约定：
 * - code === 0 表示业务成功；
 * - 非 0 code 使用稳定、可检索的业务错误码；
 * - timestamp 为服务端生成的 ISO 8601 UTC 时间。
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

export type ApiErrorDetails = unknown;

export type ApiErrorResponse = ApiResponse<{
  details: ApiErrorDetails;
}>;
