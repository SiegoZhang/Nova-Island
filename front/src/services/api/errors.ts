import type { ApiErrorDetails } from "@/types/api";

interface ApiClientErrorOptions {
  code: number;
  status: number;
  details?: ApiErrorDetails;
  cause?: unknown;
}

export class ApiClientError extends Error {
  readonly code: number;
  readonly status: number;
  readonly details: ApiErrorDetails;

  constructor(message: string, options: ApiClientErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApiClientError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details ?? null;
  }
}

