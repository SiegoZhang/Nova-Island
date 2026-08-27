import { z } from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateNewPassword,
} from "@/lib/password-policy";

export { PASSWORD_HINT } from "@/lib/password-policy";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "用户名至少 3 个字符")
  .max(32, "用户名最多 32 个字符")
  .regex(/^[a-zA-Z0-9_]+$/, "用户名仅支持字母、数字和下划线");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "请填写邮箱")
  .max(255, "邮箱过长")
  .email("请输入有效的邮箱地址");

/** 注册 / 改密用的新密码。 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `密码至少 ${PASSWORD_MIN_LENGTH} 位`)
  .max(PASSWORD_MAX_LENGTH, `密码最多 ${PASSWORD_MAX_LENGTH} 位`)
  .superRefine((value, ctx) => {
    const message = validateNewPassword(value);
    if (message && message !== `密码至少 ${PASSWORD_MIN_LENGTH} 位`) {
      ctx.addIssue({ code: "custom", message });
    }
  });

/** 登录口令：不套用强度规则，避免拦住历史短密码。 */
export const loginPasswordSchema = z
  .string()
  .min(1, "请输入密码")
  .max(PASSWORD_MAX_LENGTH, `密码最多 ${PASSWORD_MAX_LENGTH} 位`);

export const registerFormSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(64, "昵称最多 64 个字符")
      .optional()
      .or(z.literal("")),
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "请再次输入密码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export const loginFormSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "用户名或邮箱至少 3 个字符")
    .max(255, "用户名或邮箱过长"),
  password: loginPasswordSchema,
});

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

/** 将 Zod 错误转为字段 map（取每字段首条）。 */
export function zodFieldErrors(
  error: z.ZodError,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) {
      result[key] = issue.message;
    }
  }
  return result;
}
