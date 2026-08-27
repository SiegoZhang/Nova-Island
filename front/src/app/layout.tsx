import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { MustChangePasswordGate } from "@/components/auth/MustChangePasswordGate";

export const metadata: Metadata = {
  title: "新岛 AI",
  description: "数字时代 AI 原住民的聚集地",
  icons: {
    icon: "/images/logo-icon.png",
    apple: "/images/logo-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <MustChangePasswordGate>{children}</MustChangePasswordGate>
        </AuthProvider>
      </body>
    </html>
  );
}
