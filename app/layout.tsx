import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: '가톨릭그램',
  description: '기도와 묵상을 나누는 가톨릭 커뮤니티',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  // 아이폰 '홈 화면에 추가' 시 앱처럼 열리도록
  appleWebApp: {
    capable: true,
    title: '가톨릭그램',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#1c1917',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
