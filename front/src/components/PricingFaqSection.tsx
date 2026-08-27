"use client";

import Link from "next/link";
import { useState } from "react";

import { CheckIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { SectionDivider } from "@/components/SectionDivider";
import { eBtnGhost, eBtnPrimary, eEyebrow, ePageContainer } from "@/lib/eleven";

const benefits = [
  "优先参与岛屿内测活动与独家计划",
  "加入专属社群，与早期岛民共同共创",
  "获取前沿 AI 工具、资源与学习内容",
] as const;

const privileges = [
  {
    label: "限量",
    title: "首期资格与岛民身份",
    description: "优先加入，锁定首批岛民身份",
  },
  {
    label: "解锁",
    title: "8 大岛民核心权益",
    description: "专属内容、工具与资源持续更新",
  },
  {
    label: "岛民专享",
    title: "主流 AI 工具优惠",
    description: "精选合作伙伴权益，长期价值回馈",
  },
] as const;

const faqs = [
  {
    question: "NOVA Island 是什么？",
    answer:
      "NOVA Island 是一个 AI Native 的行动型社区，连接全球的创造者、开发者与探索者，一起探索 AI 如何重塑认知、工具与生活方式。",
  },
  {
    question: "加入岛屿需要费用吗？",
    answer:
      "正式岛民年费计划为 ¥599/年，目前付费通道尚未开放。现阶段可免费注册账号，使用浏览、发帖、互动等社区基础功能。",
  },
  {
    question: "如何成为正式岛民？",
    answer:
      "点击「立即登岛」前往注册。支付与审核流程暂未上线；注册完成后即可登录进入社区参与讨论。已有账号可点击首页「已是岛民」登录。",
  },
  {
    question: "岛屿目前有哪些活动或计划？",
    answer:
      "社区内可浏览精华、最新动态、航海与活动信息。部分运营活动仍在筹备中，入口会标明「暂未开放」；已上线的内容均可直接使用。",
  },
] as const;

export function PricingFaqSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section id="pricing">
      <div className="bg-[#F8F8F8] py-20">
        <div
          className={`${ePageContainer} grid gap-14 md:grid-cols-2 md:items-center`}
        >
          <div className="reveal">
            <p className={eEyebrow}>JOIN NOVA</p>
            <h2 className="mt-4 text-[32px] leading-[1.1] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[40px]">
              成为第一批岛民
            </h2>
            <p className="mt-4 max-w-[440px] text-[16px] leading-[1.65] text-[#57534e]">
              NOVA Island 是 AI
              时代的原住民聚集地。我们相信，通过连接、共创与探索，每个人都能在这里找到属于自己的方向。
            </p>

            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[#efefef] bg-[#efefef]">
              {benefits.map((benefit) => (
                <div
                  key={benefit}
                  className="flex items-center gap-4 bg-[#fdfcfc] px-6 py-4"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1c1917] text-white">
                    <CheckIcon className="size-3 stroke-[2.2]" />
                  </span>
                  <p className="text-[14px] leading-[1.5] text-[#1c1917]">
                    {benefit}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="reveal reveal-delay-1">
            <div className="rounded-2xl border border-[#efefef] bg-[#fdfcfc] p-8">
              <p className={eEyebrow}>首发 PRO · 岛民年费</p>
              <div className="mt-5 flex items-end gap-2">
                <span className="pb-2 text-[22px] leading-none font-medium text-[#1c1917]">
                  ¥
                </span>
                <span className="text-[64px] leading-[0.88] font-medium tracking-[-0.03em] text-[#1c1917]">
                  599
                </span>
                <span className="pb-2 text-[15px] text-[#78716c]">/ 年</span>
              </div>

              <div className="mt-6 divide-y divide-[#efefef] border-y border-[#efefef]">
                {privileges.map((privilege) => (
                  <div key={privilege.label} className="py-3.5">
                    <p className="text-[14px] leading-[1.5] font-medium text-[#1c1917]">
                      <span className="mr-2 text-[#78716c]">
                        {privilege.label}
                      </span>
                      <span className="mr-2 text-[#efefef]">|</span>
                      {privilege.title}
                    </p>
                    <p className="mt-1 text-[14px] leading-[1.5] text-[#57534e]">
                      {privilege.description}
                    </p>
                  </div>
                ))}
              </div>

              <Link href="/register" className={`${eBtnPrimary} mt-6 w-full`}>
                立即登岛
              </Link>
              <p className="mt-3 text-center text-[12px] leading-[1.6] text-[#78716c]">
                付费年费暂未开通。现在可免费注册，进入社区浏览与发帖。
                已有账号？
                <Link
                  href="/login?next=/community"
                  className="ml-1 text-[#1c1917] underline underline-offset-2 transition-colors hover:text-black"
                >
                  去登录
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      <SectionDivider topBg="#F8F8F8" />

      <div className="bg-[#fdfcfc] py-20">
        <div
          className={`${ePageContainer} grid gap-10 md:grid-cols-[35fr_65fr] md:gap-16`}
        >
          <div className="reveal">
            <p className={eEyebrow}>FAQ</p>
            <h2 className="mt-4 text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[32px]">
              常见问题
            </h2>
            <p className="mt-4 max-w-[300px] text-[16px] leading-[1.65] text-[#57534e]">
              以下是大家最关心的问题，如还有其他疑问，欢迎联系我们。
            </p>
            <Link href="/contact" className={`${eBtnGhost} mt-7`}>
              联系我们
            </Link>
          </div>

          <div className="reveal reveal-delay-1 border-t border-[#efefef]">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              const panelId = `faq-panel-${index}`;
              const triggerId = `faq-trigger-${index}`;

              return (
                <div key={faq.question} className="border-b border-[#efefef]">
                  <button
                    id={triggerId}
                    type="button"
                    className="flex w-full items-center justify-between gap-6 py-4 text-left"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                  >
                    <span className="text-[14px] leading-[1.5] font-medium text-[#1c1917]">
                      {faq.question}
                    </span>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#efefef] text-[#1c1917]">
                      {isOpen ? (
                        <MinusIcon aria-hidden="true" className="size-3.5" />
                      ) : (
                        <PlusIcon aria-hidden="true" className="size-3.5" />
                      )}
                    </span>
                  </button>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    hidden={!isOpen}
                    className="pb-5 pr-12"
                  >
                    <p className="max-w-[680px] text-[14px] leading-[1.65] text-[#57534e]">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
