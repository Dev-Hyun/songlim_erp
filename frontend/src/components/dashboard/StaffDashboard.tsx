"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardListCard from "@/components/dashboard/DashboardListCard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface Contract {
  id: number;
  title: string;
  status: string;
  buyer_hospital: string | null;
  sale_amount: number;
  updated_at: string;
}

interface CsTicket {
  id: number;
  title: string;
  status: string;
  created_by_name: string;
  created_at: string;
}

interface Notice {
  id: number;
  title: string;
  created_by_name: string;
  created_at: string;
}

interface CalendarEvent {
  id: number;
  title: string;
  start_at: string;
  is_shared: boolean;
  created_by: number;
  assignee_ids: number[];
}

const CONTRACT_BADGE: Record<string, string> = {
  진행중: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  보류: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
};

const CS_BADGE: Record<string, string> = {
  접수: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  처리중: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  처리완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
};

function StatCard({ label, value, href, accent }: { label: string; value: number; href: string; accent: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <span className="text-xs font-semibold text-gray-400">{label}</span>
      <span className={`mt-2 text-3xl font-extrabold ${accent}`}>{value}</span>
    </Link>
  );
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

export default function StaffDashboard() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [csTickets, setCsTickets] = useState<CsTicket[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/contracts`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/cs`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/notices?notice_type=internal`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/calendar-events`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([c, cs, n, ev]) => {
        setContracts(c);
        setCsTickets(cs);
        setNotices(n);
        setEvents(ev);
      })
      .finally(() => setLoading(false));
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const myId = user?.id;
  // 홈의 "다가오는 일정"은 내가 초대된(또는 내가 만든) 일정만 노출
  const myEvents = events.filter((e) => e.created_by === myId || (e.assignee_ids || []).includes(myId ?? -1));
  const inProgressContracts = contracts.filter((c) => c.status === "진행중");
  const openCs = csTickets.filter((t) => t.status !== "처리완료");
  const upcomingEvents = myEvents
    .filter((e) => e.start_at >= todayStr)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, 3);
  const todayCount = myEvents.filter((e) => e.start_at.slice(0, 10) === todayStr).length;

  const greetName = user?.display_name || user?.username || "";

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white/90">
          안녕하세요, {greetName}
          {user?.position ? ` ${user.position}` : ""}님 👋
        </h1>
        <p className="mt-1 text-sm text-gray-400">오늘도 좋은 하루 되세요.</p>
      </div>

      <div className="col-span-12 grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4">
        <StatCard label="진행중 계약" value={inProgressContracts.length} href="/contracts" accent="text-warning-500" />
        <StatCard label="미처리 CS" value={openCs.length} href="/cs" accent="text-error-500" />
        <StatCard label="오늘 일정" value={todayCount} href="/calendar" accent="text-brand-500" />
        <StatCard label="전체 계약 건수" value={contracts.length} href="/contracts" accent="text-gray-700 dark:text-gray-200" />
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="다가오는 일정" href="/calendar" footerLabel="전체 캘린더 보기" loading={loading} isEmpty={upcomingEvents.length === 0} emptyText="예정된 일정이 없습니다">
          <ul className="space-y-3">
            {upcomingEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-gray-700 dark:text-gray-200">{e.title}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-400">{e.start_at.replace("T", " ").slice(0, 16)}</span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="회사 공지사항" href="/notices/internal" footerLabel="전체 공지사항 보기" loading={loading} isEmpty={notices.length === 0} emptyText="등록된 공지가 없습니다">
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
        <DashboardListCard title="최근 계약 진행 현황" href="/contracts" footerLabel="전체 계약 보기" loading={loading} isEmpty={contracts.length === 0} emptyText="등록된 계약이 없습니다">
          <ul className="space-y-3">
            {contracts.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-700 dark:text-gray-200">{c.title}</div>
                  <div className="text-xs text-gray-400">{c.buyer_hospital || "-"}</div>
                </div>
                <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${CONTRACT_BADGE[c.status] || ""}`}>
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <DashboardListCard title="최근 CS 접수" href="/cs" footerLabel="전체 CS 보기" loading={loading} isEmpty={csTickets.length === 0} emptyText="접수된 CS가 없습니다">
          <ul className="space-y-3">
            {csTickets.slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-700 dark:text-gray-200">{t.title}</div>
                  <div className="text-xs text-gray-400">{t.created_by_name}</div>
                </div>
                <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${CS_BADGE[t.status] || ""}`}>
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        </DashboardListCard>
      </div>
    </div>
  );
}
