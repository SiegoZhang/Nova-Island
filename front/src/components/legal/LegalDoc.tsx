import type { ReactNode } from "react";

import { PageHeader } from "@/components/community/PageHeader";

export function LegalDoc({
  title,
  description,
  updatedAt,
  children,
}: {
  title: string;
  description: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="section-container w-full py-8 md:py-10">
      <PageHeader title={title} description={description} />
      <p className="mt-3 text-[12px] text-muted-foreground">
        最近更新：{updatedAt}
      </p>
      <article className="prose-legal mx-auto mt-8 max-w-3xl space-y-6 text-[14px] leading-7 text-foreground/90">
        {children}
      </article>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      <div className="space-y-2 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground/80">
        {children}
      </div>
    </section>
  );
}
