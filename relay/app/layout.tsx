import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "현장 관측 영상 연결",
  description: "공개 Google Drive 관측 자료를 지도 뷰어에 전달합니다.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
