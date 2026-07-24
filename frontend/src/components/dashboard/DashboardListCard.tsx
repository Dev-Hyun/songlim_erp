"use client";

import Link from "next/link";

/**
 * 대시보드용 리스트 카드. 병원/송림 메인화면 카드의 크기(높이)와 하단 "전체보기" 버튼 위치를
 * 통일하기 위한 공용 컴포넌트 — 내용이 비어있거나 5개 미만이어도 버튼은 항상 카드 하단에 고정된다.
 */
export default function DashboardListCard({
  title,
  href,
  footerLabel,
  loading,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  href: string;
  footerLabel: string;
  loading: boolean;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[400px] flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : isEmpty ? (
          <div className="py-6 text-center text-sm text-gray-400">{emptyText}</div>
        ) : (
          children
        )}
      </div>
      <Link
        href={href}
        className="border-t border-gray-100 px-5 py-3 text-center text-xs font-semibold text-brand-500 hover:underline dark:border-gray-800"
      >
        {footerLabel} →
      </Link>
    </div>
  );
}
