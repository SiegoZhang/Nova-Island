import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export default function AccountLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col bg-background">
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 flex-col pt-[var(--main-nav-safe-height)]">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
