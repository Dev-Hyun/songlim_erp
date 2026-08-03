import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import ServiceWorkerRegister from '@/components/common/ServiceWorkerRegister';

// UI의 대부분이 한글이라 한글 글리프를 포함한 웹폰트를 기본값으로 둔다(기기별 시스템 폰트 폴백 편차 제거).
// Noto Sans KR은 라틴 문자도 포함하므로 숫자/영문까지 한 폰트로 일관되게 렌더된다.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "송림메디칼", template: "%s | 송림메디칼" },
  description: "송림메디칼 사내 ERP — 전국 의료장비 영업 데이터 플랫폼",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#3182F6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
