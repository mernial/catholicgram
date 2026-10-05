import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { TEXT_SIZE_BOOT_SCRIPT } from "@/lib/text-size";

// 나눔스퀘어라운드 (네이버, OFL 무료 글꼴) — 둥글고 부드러운 고딕체
const nanumSquareRound = localFont({
  src: [
    { path: "./fonts/NanumSquareRoundL.woff2", weight: "300", style: "normal" },
    { path: "./fonts/NanumSquareRoundR.woff2", weight: "400", style: "normal" },
    { path: "./fonts/NanumSquareRoundB.woff2", weight: "700", style: "normal" },
    { path: "./fonts/NanumSquareRoundEB.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-round",
  display: "swap",
});

export const metadata: Metadata = {
  title: '가톨릭그램',
  description: '기도와 묵상을 나누는 가톨릭 커뮤니티',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-v2-192.png',
    apple: '/apple-touch-icon-v2.png',
  },
  // 아이폰 '홈 화면에 추가' 시 앱처럼 열리도록
  appleWebApp: {
    capable: true,
    title: '가톨릭그램',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // 노치가 있는 폰에서 화면 끝까지 사용 (안전 영역은 pb-safe 등으로 피함)
  interactiveWidget: 'resizes-content', // 키보드가 올라오면 화면 높이를 줄여 입력창이 키보드 위에 보이게 (안드로이드)
  themeColor: '#FAF7F2',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${nanumSquareRound.variable} h-full antialiased`}
      suppressHydrationWarning // 글씨 크기 설정이 html 에 바로 적용되므로
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
