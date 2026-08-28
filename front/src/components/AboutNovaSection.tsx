import Link from "next/link";

import { LineRevealText } from "@/components/LineRevealText";
import { ePageContainer } from "@/lib/eleven";

export function AboutNovaSection() {
  return (
    <section id="about" className="w-full bg-black">
      <div className={ePageContainer}>
        <div data-parallax className="p-10 md:p-16">
          <LineRevealText className="mx-auto max-w-[900px] text-center text-[24px] leading-[1.5] text-[#d4d4d8]">
            新岛专注于人工智能领域的知识服务与工程落地，业务由{" "}
            <Link
              href="/ai"
              className="mx-1 inline-flex h-9 items-center justify-center rounded-full bg-white px-2.5 align-middle text-[16px] font-semibold text-[#0b0b0c] transition-colors hover:bg-white/85"
            >
              AI社群
            </Link>{" "}
            与{" "}
            <Link
              href="/fde"
              className="mx-1 inline-flex h-9 items-center justify-center rounded-full bg-white px-2.5 align-middle text-[16px] font-semibold text-[#0b0b0c] transition-colors hover:bg-white/85"
            >
              FDE
            </Link>{" "}
            两大模块构成。我们以「认知—落地」为主线，前者面向个人与团队，持续沉淀前沿动态与实践方法；后者面向企业客户，提供深度定制的
            AI 工程化交付，推动技术在真实业务场景中产生价值。
          </LineRevealText>
        </div>
      </div>
    </section>
  );
}
