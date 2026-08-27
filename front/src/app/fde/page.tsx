import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { GridRails } from "@/components/GridRails";
import { HeroCtas } from "@/components/HeroCtas";
import { Navbar } from "@/components/Navbar";
import { SectionDivider } from "@/components/SectionDivider";
import { eBtnPrimary, eMono, eRailContainer, ePageContainer } from "@/lib/eleven";

export const metadata: Metadata = {
  title: "FDE业务 · 新岛",
  description: "Forward Deployed Engineer — 深入客户真实业务场景，以工程化能力驱动 AI 规模化落地。",
};

const services = [
  {
    step: "01",
    title: "场景诊断",
    description:
      "深入业务前端，识别 AI 的真实价值切入点。我们不从技术出发，而是从业务痛点倒推，找到真正值得投入的场景，避免为技术而技术。",
  },
  {
    step: "02",
    title: "定制交付",
    description:
      "从方案设计到系统搭建，依据业务实际提供绑定落地。我们拒绝模板化方案，每个项目都针对客户的具体场景、数据和流程定制工程实现。",
  },
  {
    step: "03",
    title: "持续陪跑",
    description:
      "交付即起点。上线后以数据驱动的迭代确保能力长期有效，陪伴客户从 0→1 再到规模化，而不是交付即结束。",
  },
  {
    step: "04",
    title: "成果案例",
    description:
      "以可量化的业务成果验证 AI 工程化的实际价值。我们用效率提升、成本降低、收入增长等真实指标衡量每一次交付。",
  },
] as const;

const steps = [
  {
    n: 1,
    title: "初步沟通",
    description: "了解业务背景与核心挑战，判断 AI 介入的可行性与优先级。",
    active: true,
  },
  {
    n: 2,
    title: "场景深访",
    description: "深入业务现场，访谈关键角色，梳理真实流程与数据现状。",
    active: true,
  },
  {
    n: 3,
    title: "方案设计与交付",
    description: "输出定制化工程方案，完成系统搭建与集成，确保可用、好用。",
    active: true,
  },
  {
    n: 4,
    title: "持续迭代",
    description: "基于真实使用数据持续优化，推动 AI 能力长期发挥价值。",
    active: false,
  },
] as const;

export default function FdePage() {
  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <Navbar />
      <main className="relative">
        <GridRails />
        <section id="hero" className="relative h-[520px] bg-[#fdfcfc]">
          <div
            className={`relative flex h-full items-start justify-center overflow-hidden ${eRailContainer}`}
          >
            <div className="relative flex flex-col items-center px-6 pt-[140px] text-center">
              <p className="reveal text-[15px] font-medium text-[#868686]">
                FDE业务
              </p>

              <h1 className="reveal reveal-delay-1 mt-5 text-[clamp(56px,11vw,84px)] font-semibold leading-[1.05] tracking-[-0.03em] text-[#1c1917]">
                FDE业务
              </h1>

              <p className="reveal reveal-delay-2 mt-8 max-w-[600px] text-[18px] leading-[1.6] text-[#868686]">
                Forward Deployed Engineer — 深入客户真实业务场景，以工程化能力驱动 AI 规模化落地。
              </p>

              <HeroCtas />
            </div>
          </div>
        </section>

        <SectionDivider />

        <section className="bg-[#fdfcfc] py-20">
          <div
            className={`${ePageContainer} grid gap-14 md:grid-cols-2 md:items-center`}
          >
            <div>
              <h2 className="text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[32px]">
                什么是 FDE？
              </h2>
              <p className="mt-5 text-[16px] leading-[1.65] text-[#57534e]">
                FDE（Forward Deployed Engineer）是新岛的前沿部署工程师团队。区别于传统咨询或标准化
                SaaS 方案，FDE 深度嵌入客户业务，真正理解场景后再设计方案。
              </p>
              <p className="mt-4 text-[16px] leading-[1.65] text-[#57534e]">
                我们不卖 AI 概念，只做真实落地。从场景诊断到工程交付，从上线到持续迭代，全程陪跑，以可量化的业务结果衡量价值。
              </p>
            </div>
            <div
              aria-hidden="true"
              className="aspect-[4/3] rounded-2xl border border-[#efefef] bg-[#F8F8F8]"
            />
          </div>
        </section>

        <SectionDivider bottomBg="#F8F8F8" />

        <section className="bg-[#F8F8F8] py-20">
          <div className={ePageContainer}>
            <h2 className="mb-10 text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[32px]">
              服务内容
            </h2>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-[#efefef] bg-[#efefef] sm:grid-cols-2">
              {services.map(({ step, title, description }) => (
                <div key={step} className="bg-[#fdfcfc] p-9">
                  <p
                    className={`text-[12px] tracking-[0.08em] text-[#78716c] ${eMono}`}
                  >
                    {step}
                  </p>
                  <h3 className="mt-3 text-[18px] leading-[1.3] font-medium text-[#1c1917]">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-[14px] leading-[1.65] text-[#57534e]">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider topBg="#F8F8F8" />

        <section className="bg-[#fdfcfc] py-20">
          <div className={`${ePageContainer} grid gap-14 md:grid-cols-2`}>
            <div>
              <h2 className="mb-10 text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[32px]">
                合作流程
              </h2>
              <div>
                {steps.map(({ n, title, description, active }, index) => (
                  <div
                    key={n}
                    className={`relative flex gap-6 ${index === steps.length - 1 ? "pb-0" : "pb-9"}`}
                  >
                    {index !== steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-7 bottom-0 left-[11px] w-px bg-[#efefef]"
                      />
                    )}
                    <div
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${eMono} ${
                        active
                          ? "border-[#1c1917] text-[#1c1917]"
                          : "border-[#efefef] text-[#78716c]"
                      }`}
                    >
                      {n}
                    </div>
                    <div>
                      <p
                        className={`text-[15px] tracking-[-0.01em] ${active ? "text-[#1c1917]" : "text-[#78716c]"}`}
                      >
                        {title}
                      </p>
                      <p className="mt-1.5 text-[14px] leading-[1.65] text-[#57534e]">
                        {description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-center gap-5 rounded-2xl border border-[#efefef] bg-[#F8F8F8] p-10">
              <h3 className="text-[24px] leading-[1.2] font-medium tracking-[-0.02em] text-[#1c1917]">
                有具体的业务场景？
              </h3>
              <p className="text-[16px] leading-[1.65] text-[#57534e]">
                告诉我们你的挑战，我们来判断 AI 能帮你做什么。
              </p>
              <Link href="/contact" className={`${eBtnPrimary} self-start`}>
                预约沟通
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
