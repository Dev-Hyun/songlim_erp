"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ComponentCard from "@/components/common/ComponentCard";
import DashboardListCard from "@/components/dashboard/DashboardListCard";
import { fetchMyOrders, SupplyOrder } from "@/components/supply/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

const QUICK_LINKS = [
  { label: "병원 공지사항", href: "/notices/hospital" },
  { label: "의료소식", href: "/news" },
  { label: "공동구매", href: "/group-buy" },
  { label: "중고기기", href: "/used-equipment" },
  { label: "CS접수", href: "/cs" },
  { label: "소모품 발주", href: "/supply" },
];

const ORDER_STATUS_COLOR: Record<string, string> = {
  접수: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  출고: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  배송완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  직납출고: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  직납완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
};

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
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);

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
    fetchMyOrders()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, []);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthTotal = orders.filter((o) => o.created_at?.slice(0, 7) === thisMonthKey).reduce((s, o) => s + o.total_amount, 0);
  const lastMonthTotal = orders.filter((o) => o.created_at?.slice(0, 7) === lastMonthKey).reduce((s, o) => s + o.total_amount, 0);
  const diffPct = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

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

      {!ordersLoading && (
        <div className="col-span-12 flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:flex-row sm:items-center">
          <div>
            <span className="text-xs font-semibold text-gray-400">이번 달 발주액</span>
            <div className="mt-1 text-2xl font-extrabold text-gray-800 dark:text-white">{thisMonthTotal.toLocaleString()}원</div>
          </div>
          <div className="mt-2 text-xs text-gray-400 sm:mt-0 sm:text-right">
            {diffPct === null ? (
              <span>전월 발주 내역이 없어 비교할 수 없습니다</span>
            ) : (
              <span>
                전월 대비{" "}
                <span className={`font-bold ${diffPct >= 0 ? "text-success-600 dark:text-success-400" : "text-error-500"}`}>
                  {diffPct >= 0 ? "▲" : "▼"} {Math.abs(diffPct)}%
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="col-span-12">
        <ComponentCard title="내 발주내역 상태">
          {ordersLoading ? (
            <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : orders.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">발주 내역이 없습니다</div>
          ) : (
            <>
              <div className="mb-3 text-xs font-semibold text-gray-400">누적 발주 {orders.length}건 · 최근 3건</div>
              <ul className="space-y-2">
                {orders.slice(0, 3).map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700 dark:text-gray-200">발주 #{o.id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ORDER_STATUS_COLOR[o.status] || "bg-gray-100 text-gray-600"}`}>{o.status}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-800 dark:text-white/90">{o.total_amount.toLocaleString()}원</div>
                      <div className="text-[11px] text-gray-400">{o.created_at?.slice(0, 10)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/my/supply-orders" className="mt-4 block text-center text-xs font-semibold text-brand-500 hover:underline">
            전체 발주내역 보기 →
          </Link>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="병원 공지사항" href="/notices/hospital" footerLabel="전체 공지사항 보기" loading={loading} isEmpty={notices.length === 0} emptyText="등록된 공지가 없습니다">
          <ul className="space-y-3">
            {notices.slice(0, 3).map((n) => (
              <li key={n.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{n.title}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">{timeAgo(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="의료소식" href="/news" footerLabel="전체 의료소식 보기" loading={loading} isEmpty={news.length === 0} emptyText="등록된 소식이 없습니다">
          <ul className="space-y-3">
            {news.slice(0, 3).map((n) => (
              <li key={n.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{n.title}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">{n.source}</span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="공동구매" href="/group-buy" footerLabel="전체 공동구매 보기" loading={loading} isEmpty={groupBuy.length === 0} emptyText="등록된 공동구매가 없습니다">
          <ul className="space-y-3">
            {groupBuy.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{p.title}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">{timeAgo(p.created_at)}</span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="중고기기" href="/used-equipment" footerLabel="전체 중고기기 보기" loading={loading} isEmpty={usedEquipment.length === 0} emptyText="등록된 중고기기가 없습니다">
          <ul className="space-y-3">
            {usedEquipment.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{p.title}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">{timeAgo(p.created_at)}</span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>
    </div>
  );
}
