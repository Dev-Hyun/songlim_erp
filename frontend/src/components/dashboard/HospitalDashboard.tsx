"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import SimpleBoard from "@/components/board/SimpleBoard";

const QUICK_LINKS = [
  { label: "병원용 공지사항", href: "/notices/hospital" },
  { label: "의료소식", href: "/news" },
  { label: "공동구매", href: "/group-buy" },
  { label: "중고기기", href: "/used-equipment" },
  { label: "CS접수", href: "/cs" },
  { label: "소모품 발주", href: "/supply" },
];

export default function HospitalDashboard() {
  const { user } = useAuth();
  const name = user?.hospital_name || user?.display_name || user?.username || "";

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white/90">
          안녕하세요, {name}님 👋
        </h1>
        <p className="mt-1 text-sm text-gray-400">오늘도 좋은 하루 되세요.</p>
      </div>

      <div className="col-span-12 grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-6">
        {QUICK_LINKS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-5 text-center text-sm font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
          >
            {q.label}
          </Link>
        ))}
      </div>

      <div className="col-span-12">
        <SimpleBoard endpoint="/api/notices?notice_type=hospital" title="병원용 공지사항" canWrite={false} />
      </div>
    </div>
  );
}
