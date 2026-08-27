import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <Image
        src="/images/logo-icon.png"
        alt=""
        width={48}
        height={48}
        className="size-12"
      />
      <p className="mt-6 text-[64px] leading-none font-bold tracking-tight text-foreground">
        404
      </p>
      <h1 className="mt-4 text-[20px] font-semibold tracking-tight text-foreground">
        这片海域还没有陆地
      </h1>
      <p className="mt-2 max-w-sm text-[14px] leading-6 text-muted-foreground">
        你要找的页面不存在，或许它已经漂向了别处。让我们带你回到岸上。
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-[14px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          返回首页
        </Link>
        <Link
          href="/community"
          className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-card/60 px-6 text-[14px] font-medium text-foreground transition-colors duration-300 hover:border-foreground/25 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          去逛社区
        </Link>
      </div>
    </main>
  );
}
