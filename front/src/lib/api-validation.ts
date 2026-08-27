import { ApiClientError } from "@/services/api/errors";

/** Pydantic / FastAPI 校验错误单条结构（宽松解析）。 */
interface ValidationIssue {
  loc?: unknown[];
  msg?: string;
  type?: string;
  ctx?: Record<string, unknown>;
}

const FIELD_LABELS: Record<string, string> = {
  username: "用户名",
  email: "邮箱",
  password: "密码",
  display_name: "昵称",
  displayName: "昵称",
  identifier: "用户名或邮箱",
  current_password: "当前密码",
  currentPassword: "当前密码",
  new_password: "新密码",
  newPassword: "新密码",
  confirmPassword: "确认密码",
  bio: "个人简介",
  avatar_url: "头像链接",
  avatarUrl: "头像链接",
  title: "标题",
  content: "内容",
};

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === "object" && value !== null;
}

function fieldFromLoc(loc: unknown[] | undefined): string | null {
  if (!Array.isArray(loc) || loc.length === 0) return null;
  const parts = loc.filter((part): part is string | number =>
    typeof part === "string" || typeof part === "number",
  );
  // 跳过 body / query 等位置前缀
  const skip = new Set(["body", "query", "path", "header", "cookie"]);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (typeof part === "string" && !skip.has(part)) {
      return part;
    }
  }
  return null;
}

function humanizeIssue(issue: ValidationIssue, field: string | null): string {
  const label = field
    ? (FIELD_LABELS[field] ?? FIELD_LABELS[snakeToCamel(field)] ?? field)
    : "该字段";
  const type = issue.type ?? "";
  const ctx = issue.ctx ?? {};

  if (type === "string_too_short" || type === "too_short") {
    const min = ctx.min_length ?? ctx.minLength;
    return typeof min === "number"
      ? `${label}至少 ${min} 个字符`
      : `${label}过短`;
  }
  if (type === "string_too_long" || type === "too_long") {
    const max = ctx.max_length ?? ctx.maxLength;
    return typeof max === "number"
      ? `${label}最多 ${max} 个字符`
      : `${label}过长`;
  }
  if (type === "string_pattern_mismatch" || type === "pattern") {
    if (field === "username") {
      return "用户名仅支持字母、数字和下划线";
    }
    if (field === "email") {
      return "请输入有效的邮箱地址";
    }
    return `${label}格式不正确`;
  }
  if (type === "missing" || type === "value_error.missing") {
    return `请填写${label}`;
  }
  if (
    type === "value_error" ||
    type.includes("email") ||
    issue.msg?.toLowerCase().includes("email")
  ) {
    if (field === "email") return "请输入有效的邮箱地址";
  }

  const msg = issue.msg?.trim();
  if (msg && !msg.toLowerCase().startsWith("value error")) {
    // 英文默认文案过长时退回标签提示
    if (/^[A-Za-z]/.test(msg) && msg.length > 40) {
      return `${label}不符合要求`;
    }
    if (/^[A-Za-z]/.test(msg)) {
      return `${label}不符合要求`;
    }
    return msg;
  }
  return `${label}不符合要求`;
}

/**
 * 将 API 校验 details 解析为字段错误（camelCase key）与汇总文案。
 */
export function parseValidationDetails(details: unknown): {
  fieldErrors: Record<string, string>;
  summary: string | null;
} {
  if (!Array.isArray(details)) {
    return { fieldErrors: {}, summary: null };
  }

  const fieldErrors: Record<string, string> = {};
  const messages: string[] = [];

  for (const raw of details) {
    if (!isValidationIssue(raw)) continue;
    const field = fieldFromLoc(raw.loc);
    const message = humanizeIssue(raw, field);
    if (field) {
      const key = snakeToCamel(field);
      if (!fieldErrors[key]) {
        fieldErrors[key] = message;
      }
    }
    messages.push(message);
  }

  return {
    fieldErrors,
    summary: messages.length > 0 ? messages.join("；") : null,
  };
}

/** 从 ApiClientError 得到优先展示的文案（字段汇总 > message）。 */
export function formatApiErrorMessage(
  error: unknown,
  fallback = "请求失败，请稍后重试",
): string {
  if (!(error instanceof ApiClientError)) {
    return fallback;
  }
  const { summary } = parseValidationDetails(error.details);
  if (summary) return summary;
  return error.message || fallback;
}

/** 从 ApiClientError 提取字段级错误（camelCase）。 */
export function formatApiFieldErrors(
  error: unknown,
): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {};
  return parseValidationDetails(error.details).fieldErrors;
}
