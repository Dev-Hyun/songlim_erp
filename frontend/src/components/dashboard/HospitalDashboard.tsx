"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ComponentCard from "@/components/common/ComponentCard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

const QUICK_LINKS = [
  { label: "병원용 공지사항", href: "/notices/hospital" },
  { label: "의료소식", href: "/news" },
  { label: "공동구매", href: "/group-buy" },
  { label: "중고기기", href: "/used-equipment" },
  { label: "CS접수", href: "/cs" },
  { label: "소모품 발주", href: "/supply" },
];

interface Notice {
  id: number;
  title: string;
  created_by_name: string;
  created_at: string;
}

interface NewsItem {
  id: number;
  title: string;
  source: string | null;
  created_at: string;
}

interface TechPost {
  id: number;
  title: string;
  created_by_name: string;
  created_at: string;
}

function timeAgo(iso: string) {
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function HospitalDashboard() {
  const { user } = useAuth();
  const name = user?.hospital_name || user?.display_name || user?.username || "";

  const [notices, setNotices] = useState<Notice[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [groupBuy, setGroupBuy] = useState<TechPost[]>([]);
  const [usedEquipment, setUsedEquipment] = useState<TechPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/notices?notice_type=hospital`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/news`, { credentials: "include" }).then((r) => (r.ok ? r.json() : { items: [] })),
      fetch(`${API}/api/tech-posts?category=${encodeURIComponent("공동구매")}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/tech-posts?category=${encodeURIComponent("중고기기")}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([n, nw, gb, ue]) => {
        setNotices(n);
        setNews(nw.items || []);
        setGroupBuy(gb);
        setUsedEquipment(ue);
      })
      .finally(() => setLoading(false));
  }, []);

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

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="병원용 공지사항" className="h-[380px]">
          {loading ? (
            <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : notices.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">등록된 공지가 없습니다</div>
          ) : (
            <ul className="space-y-3">
              {notices.slice(0, 4).map((n) => (
                <li key={n.id} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-gray-700 dark:text-gray-200">{n.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notices/hospital" className="mt-4 block text-center text-xs font-semibold text-brand-500 hover:underline">
            전체 공지사항 보기 →
          </Link>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="의료소식" className="h-[380px]">
          {loading ? (
            <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : news.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">등록된 소식이 없습니다</div>
          ) : (
            <ul className="space-y-3">
              {news.slice(0, 4).map((n) => (
                <li key={n.id} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-gray-700 dark:text-gray-200">{n.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-gray-400">{n.source}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/news" className="mt-4 block text-center text-xs font-semibold text-brand-500 hover:underline">
            전체 의료소식 보기 →
          </Link>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="공동구매" className="h-[380px]">
          {loading ? (
            <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : groupBuy.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">등록된 공동구매가 없습니다</div>
          ) : (
            <ul className="space-y-3">
              {groupBuy.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-gray-700 dark:text-gray-200">{p.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-gray-400">{timeAgo(p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/group-buy" className="mt-4 block text-center text-xs font-semibold text-brand-500 hover:underline">
            전체 공동구매 보기 →
          </Link>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="중고기기" className="h-[380px]">
          {loading ? (
            <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : usedEquipment.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">등록된 중고기기가 없습니다</div>
          ) : (
            <ul className="space-y-3">
              {usedEquipment.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-gray-700 dark:text-gray-200">{p.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-gray-400">{timeAgo(p.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/used-equipment" className="mt-4 block text-center text-xs font-semibold text-brand-500 hover:underline">
            전체 중고기기 보기 →
          </Link>
        </ComponentCard>
      </div>
    </div>
  );
}
