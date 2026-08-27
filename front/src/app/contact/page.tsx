import type { Metadata } from "next";

import { ContactForm } from "@/components/ContactForm";
import { Footer } from "@/components/Footer";
import { GridRails } from "@/components/GridRails";
import { Navbar } from "@/components/Navbar";
import { SectionDivider } from "@/components/SectionDivider";
import { eEyebrow, ePageContainer } from "@/lib/eleven";

export const metadata: Metadata = {
  title: "联系我们 · 新岛",
  description: "有问题、有合作意向，或者只是想聊聊 AI——都欢迎找我们。",
};

const CONTACT_EMAIL = "hello@novaisland.ai";

const reasons = [
  "想了解 AI社群的加入方式",
  "有 AI 落地需求，想和 FDE 团队沟通",
  "媒体合作或内容共创",
  "其他任何问题",
] as const;

const labelClass = `mb-1.5 block text-[12px] tracking-[0.06em] text-[#78716c] uppercase`;

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#fdfcfc]">
      <Navbar />
      <main className="relative">
        <GridRails />
        <section className="bg-[#fdfcfc] pt-[132px] pb-16">
          <div className={ePageContainer}>
            <p className={eEyebrow}>联系我们</p>
            <h1 className="mt-5 text-[44px] leading-[1.02] font-medium tracking-[-0.02em] text-[#1c1917] md:text-[64px]">
              联系我们
            </h1>
            <p className="mt-5 max-w-[440px] text-[18px] leading-[1.55] text-[#57534e]">
              有问题、有合作意向，或者只是想聊聊 AI——都欢迎找我们。
            </p>
          </div>
        </section>

        <SectionDivider />

        <section className="bg-[#fdfcfc] py-20">
          <div className={`${ePageContainer} grid gap-16 md:grid-cols-2`}>
            <div>
              <h2 className="mb-9 text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917]">
                我们在这里
              </h2>

              <div className="flex flex-col gap-7">
                <div>
                  <p className={labelClass}>邮箱</p>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-[15px] tracking-[-0.01em] text-[#1c1917] underline decoration-[#efefef] underline-offset-4 hover:decoration-[#1c1917]"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>

                <div>
                  <p className={labelClass}>微信公众号</p>
                  <p className="text-[15px] tracking-[-0.01em] text-[#1c1917]">
                    新岛 Nova Island
                  </p>
                </div>

                <div>
                  <p className={`${labelClass} mb-3`}>适合联系的情况</p>
                  <div className="flex flex-col gap-2.5">
                    {reasons.map((reason) => (
                      <div key={reason} className="flex items-start gap-2.5">
                        <span className="shrink-0 text-[14px] leading-[1.65] text-[#fb2c36]">
                          →
                        </span>
                        <p className="text-[14px] leading-[1.65] text-[#57534e]">
                          {reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[#efefef] pt-4">
                  <p className="text-[13px] leading-[1.65] text-[#78716c]">
                    我们通常在 1–2 个工作日内回复。
                    <br />
                    如果是企业合作咨询，请在留言中简要描述背景。
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-8 text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-[#1c1917]">
                发送留言
              </h2>
              <ContactForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
