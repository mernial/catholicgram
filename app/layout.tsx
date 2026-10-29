import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { TEXT_SIZE_BOOT_SCRIPT } from "@/lib/text-size";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { DEVICE_BOOT_SCRIPT } from "@/lib/device";
import PinchPeek from "@/components/PinchPeek";
import ConfirmHost from "@/components/ConfirmDialog";

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
  metadataBase: new URL('https://catholicgram-dey7.vercel.app'), // 공유 미리 보기(og:image)의 주소를 온전한 주소로
  title: '가톨릭그램',
  description: '기도와 묵상을 나누는 가톨릭 커뮤니티',
  // 주소를 카카오톡 등으로 보내면 보이는 미리 보기 카드 (가톨릭그램 알리기 — components/ShareApp)
  openGraph: {
    type: 'website', siteName: '가톨릭그램', url: '/', title: '가톨릭그램', description: '기도와 묵상을 나누는 가톨릭 커뮤니티',
    images: [{ url: '/og-catholicgram.jpg', width: 1200, height: 630, alt: '가톨릭그램 — 기도와 묵상을 나누는 가톨릭 커뮤니티' }],
  },
  twitter: { card: 'summary_large_image', title: '가톨릭그램', description: '기도와 묵상을 나누는 가톨릭 커뮤니티', images: ['/og-catholicgram.jpg'] },
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
  // 두 손가락으로 벌려도 앱 화면 전체가 커지지 않게 (사진·이모티콘만 커짐: components/PinchPeek). 글씨는 설정 → 글씨 크기로
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // 노치가 있는 폰에서 화면 끝까지 사용 (안전 영역은 pb-safe 등으로 피함)
  interactiveWidget: 'resizes-content', // 키보드가 올라오면 화면 높이를 줄여 입력창이 키보드 위에 보이게 (안드로이드)
  themeColor: '#FAF7F2',
  colorScheme: 'only light', // 휴대폰 다크 모드가 화면 색을 억지로 바꿔 글씨가 바탕에 묻히지 않게
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${nanumSquareRound.variable} h-full antialiased`}
      suppressHydrationWarning // 글씨 크기·화면 색 설정이 html 에 바로 적용되므로
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: DEVICE_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}<PinchPeek /><ConfirmHost /></body>
    </html>
  );
}
