import type { Metadata } from "next";

import { LegalDoc, LegalSection } from "@/components/legal/LegalDoc";

export const metadata: Metadata = {
  title: "隐私政策 · 新岛",
  description: "新岛 NOVA Island 隐私政策说明",
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="隐私政策"
      description="说明我们如何收集、使用与保护你在使用新岛服务时提供的信息。"
      updatedAt="2026-07-27"
    >
      <LegalSection title="1. 我们收集的信息">
        <p>
          当你注册或使用社区功能时，我们可能收集：账号信息（用户名、邮箱、昵称、简介、头像链接）、你主动发布的内容（帖子、评论）、以及互动记录（点赞、收藏、关注）。
        </p>
        <p>
          此外，为保障服务运行，服务器日志可能记录技术信息，例如请求时间、大致地区、浏览器类型与请求标识（Request
          ID），用于排查故障与安全防护。
        </p>
      </LegalSection>

      <LegalSection title="2. 信息如何使用">
        <p>我们使用上述信息用于：提供登录与社区功能、展示个人主页与互动状态、改进产品体验、防范滥用与保障安全。</p>
        <p>
          <strong>当前演示阶段</strong>
          不会将你的个人信息出售给第三方，也不会用于未说明的商业广告投放。
        </p>
      </LegalSection>

      <LegalSection title="3. 信息的共享与披露">
        <p>
          你公开发布的内容与公开资料（如昵称、简介、头像）对其他用户可见。除法律法规要求或为保护用户与平台安全所必需外，我们不会向无关第三方披露你的私密账号信息。
        </p>
      </LegalSection>

      <LegalSection title="4. 存储与安全">
        <p>
          账号凭据以哈希形式存储；访问令牌有时效，并可被吊销。我们采取合理的技术与管理措施保护数据，但无法保证绝对安全，请妥善保管密码。
        </p>
      </LegalSection>

      <LegalSection title="5. 你的权利">
        <p>
          你可以在「账号设置」中更新昵称、简介与头像链接，并修改密码。如需删除账号或处理相关数据请求，请通过页脚「联系我们」区域扫码联系领航员。
        </p>
      </LegalSection>

      <LegalSection title="6. 政策更新">
        <p>
          我们可能适时更新本政策。重大变更会在站内或邮件等方式提示；继续使用服务即表示你知悉更新后的内容。
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
