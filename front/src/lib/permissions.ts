import type { UserRole } from "@/types/community";

export function isStaff(role: UserRole | string | null | undefined): boolean {
  return role === "moderator" || role === "admin";
}

export function isAdmin(role: UserRole | string | null | undefined): boolean {
  return role === "admin";
}

export function canEditPostContent(params: {
  userId?: string | null;
  authorId: string;
}): boolean {
  return !!params.userId && params.userId === params.authorId;
}

export function canModeratePost(params: {
  userId?: string | null;
  role?: UserRole | string | null;
  authorId: string;
}): boolean {
  if (!params.userId) return false;
  return params.userId === params.authorId || isStaff(params.role);
}

export function canFeaturePost(role?: UserRole | string | null): boolean {
  return isStaff(role);
}

export function canDeleteComment(params: {
  userId?: string | null;
  role?: UserRole | string | null;
  authorId: string;
}): boolean {
  if (!params.userId) return false;
  return params.userId === params.authorId || isStaff(params.role);
}
