import type { Metadata } from "next";

import { LegalDoc, LegalSection } from "@/components/legal/LegalDoc";

export const metadata: Metadata = {
  title: "用户协议 · 新岛",
  description: "新岛 NOVA Island 用户协议说明",
};

export default function TermsPage() {
  return (
    <LegalDoc
      title="用户协议"
      description="使用新岛社区服务前，请阅读并理解以下约定。"
      updatedAt="2026-07-27"
    >
      <LegalSection title="1. 服务说明">
        <p>
          新岛（NOVA Island）提供 AI
          主题社区服务，包括浏览内容、发帖评论、点赞收藏与关注等功能。付费会员、支付结算等能力如页面所示「暂未开放」，以实际可用功能为准。
        </p>
      </LegalSection>

      <LegalSection title="2. 账号注册与使用">
        <p>
          你应提供真实、可用的注册信息，并对账号下的行为负责。不得盗用他人身份，不得尝试绕过鉴权、限流或权限控制。
        </p>
        <p>
          管理员可在必要时调整账号角色或停用违规账号，以维护社区秩序。
        </p>
      </LegalSection>

      <LegalSection title="3. 内容规范">
        <p>你不得发布违法、侵权、骚扰、欺诈、垃圾营销或明显有害的内容。领航员/管理员可对违规内容进行加精、隐藏或删除等处理。</p>
        <p>
          你保留对自己原创内容的相应权利，同时授权平台在社区内展示、存储与传播这些内容，以便提供服务。
        </p>
      </LegalSection>

      <LegalSection title="4. 免责声明">
        <p>
          社区内容多由用户产生，不代表平台立场。演示环境中的数据、活动与权益说明可能随版本调整；涉及费用的表述以页面明确标注为准。
        </p>
      </LegalSection>

      <LegalSection title="5. 协议变更与联系">
        <p>
          我们可能更新本协议；继续使用即视为接受更新。如有疑问，请通过页脚联系区域扫码联系领航员。
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
