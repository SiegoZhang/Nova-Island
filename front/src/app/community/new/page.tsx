import type { Metadata } from "next";

import { PostComposerForm } from "@/components/community/PostComposerForm";

export const metadata: Metadata = {
  title: "发布动态 · 新岛社区",
  description: "分享你的实战复盘与想法",
};

export default function CommunityNewPostPage() {
  return <PostComposerForm />;
}
