export type EntityId = string;
export type ISODateString = string;

export type UserRole = "member" | "moderator" | "admin";
export type UserStatus = "active" | "suspended" | "deactivated";

export interface User {
  id: EntityId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  status: UserStatus;
  followerCount: number;
  followingCount: number;
  postCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * 用于帖子与评论内嵌展示，避免业务层依赖完整用户资料。
 */
export type UserSummary = Pick<
  User,
  "id" | "username" | "displayName" | "avatarUrl" | "role"
>;

export type PostStatus = "draft" | "published" | "hidden" | "deleted";
export type PostVisibility = "public" | "members";

export type AttachmentKind = "image" | "file";

export interface PostAttachment {
  id: EntityId;
  storageKey: string;
  url: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  sortOrder: number;
}

/** 发帖时引用已上传文件（尚未落库的附件元数据）。 */
export interface AttachmentInput {
  storageKey: string;
  url: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface Post {
  id: EntityId;
  author: UserSummary;
  title: string;
  content: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  tags: string[];
  attachments: PostAttachment[];
  columnId?: EntityId | null;
  column?: ColumnSummary | null;
  status: PostStatus;
  visibility: PostVisibility;
  isFeatured: boolean;
  isLiked: boolean;
  isBookmarked: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  publishedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type VoyageStatus = "recruiting" | "in_progress" | "finished";

export interface Voyage {
  id: EntityId;
  title: string;
  summary: string;
  category: string;
  status: VoyageStatus;
  durationWeeks: number;
  captain: UserSummary;
  memberCount: number;
  capacity: number;
}

export interface Column {
  id: EntityId;
  title: string;
  description: string;
  cadence: string;
  articleCount: number;
  author: UserSummary;
  tag: string;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}

export interface ColumnSummary {
  id: EntityId;
  title: string;
  tag: string;
}

export type RankingTrend = "up" | "down" | "flat";

export interface RankingEntry {
  rank: number;
  user: UserSummary;
  headline: string;
  score: number;
  trend: RankingTrend;
}

export type EventType = "线上" | "线下";

export interface CommunityEvent {
  id: EntityId;
  title: string;
  description: string;
  type: EventType;
  city: string;
  date: string;
  time: string;
  host: UserSummary;
  seatsLeft: number;
}

export type CommentStatus = "published" | "hidden" | "deleted";

export interface Comment {
  id: EntityId;
  postId: EntityId;
  author: UserSummary;
  parentId: EntityId | null;
  replyToUser: UserSummary | null;
  content: string;
  status: CommentStatus;
  isLiked: boolean;
  likeCount: number;
  replyCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

