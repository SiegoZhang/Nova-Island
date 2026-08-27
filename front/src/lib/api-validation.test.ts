import { describe, expect, it } from "vitest";

import {
  formatApiErrorMessage,
  parseValidationDetails,
} from "@/lib/api-validation";
import { ApiClientError } from "@/services/api/errors";

describe("parseValidationDetails", () => {
  it("maps pydantic loc/msg to camelCase field errors", () => {
    const { fieldErrors, summary } = parseValidationDetails([
      {
        type: "string_too_short",
        loc: ["body", "password"],
        msg: "String should have at least 6 characters",
        ctx: { min_length: 6 },
      },
      {
        type: "string_pattern_mismatch",
        loc: ["body", "username"],
        msg: "String should match pattern",
      },
    ]);

    expect(fieldErrors.password).toBe("密码至少 6 个字符");
    expect(fieldErrors.username).toBe("用户名仅支持字母、数字和下划线");
    expect(summary).toContain("密码至少 6 个字符");
  });
});

describe("formatApiErrorMessage", () => {
  it("prefers validation summary over generic message", () => {
    const error = new ApiClientError("请求参数校验失败", {
      code: 422001,
      status: 422,
      details: [
        {
          type: "string_too_short",
          loc: ["body", "identifier"],
          msg: "too short",
          ctx: { min_length: 3 },
        },
      ],
    });
    expect(formatApiErrorMessage(error)).toBe("用户名或邮箱至少 3 个字符");
  });

  it("falls back to business message", () => {
    const error = new ApiClientError("用户名已被使用", {
      code: 409001,
      status: 409,
    });
    expect(formatApiErrorMessage(error)).toBe("用户名已被使用");
  });
});
