import Link from "next/link";

import { ePageContainer } from "@/lib/eleven";

export function Footer() {
  return (
    <footer
      id="contact"
      className="border-t border-white/10 bg-[#26282B] py-[max(24px,calc(20px+env(safe-area-inset-bottom,0px)))]"
    >
      <div className={ePageContainer}>
        <div className="flex flex-col items-center justify-between gap-5 text-center text-[12px] leading-5 text-white/65 md:flex-row md:text-left">
          <p>
            © 2026 新岛 AI ·{" "}
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              浙ICP备2026033814号-1
            </a>
          </p>
          <nav aria-label="页脚链接" className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="transition-colors hover:text-white"
            >
              隐私政策
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-white"
            >
              用户协议
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
