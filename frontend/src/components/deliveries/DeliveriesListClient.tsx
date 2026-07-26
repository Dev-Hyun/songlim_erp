"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDeliveries } from "./api";
import { DeliveryListItem } from "./types";

const DEMO_RESULT_COLOR: Record<string, string> = {
  예정: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  진행중: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  성공: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  실패: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
};

const DEMO_STATUSES = ["예정", "진행중", "성공", "실패"] as const;
const MAINT_STATUSES = ["유지보수 진행중", "유지보수 만료"] as const;

const MAINT_COLOR: Record<string, string> = {
  "유지보수 진행중": "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  "유지보수 만료": "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
};

// warranty_end(Warranty 종료일) 기준으로 유지보수 진행중/만료를 계산한다. 날짜가 없으면 아직 만료되지 않은 것으로 취급.
function maintenanceStatus(d: DeliveryListItem): string {
  if (!d.warranty_end) return "유지보수 진행중";
  const today = new Date().toISOString().slice(0, 10);
  return d.warranty_end >= today ? "유지보수 진행중" : "유지보수 만료";
}

export default function DeliveriesListClient() {
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [siteType, setSiteType] = useState<"delivery" | "demo">("delivery");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchDeliveries().then(setDeliveries).finally(() => setLoading(false));
  }, []);

  const statuses = siteType === "demo" ? DEMO_STATUSES : MAINT_STATUSES;

  function statusOf(d: DeliveryListItem): string {
    return siteType === "demo" ? d.demo_result || "" : maintenanceStatus(d);
  }

  const byType = useMemo(() => deliveries.filter((d) => d.site_type === siteType), [deliveries, siteType]);

  const filtered = useMemo(
    () =>
      byType.filter((d) => {
        if (statusFilter && statusOf(d) !== statusFilter) return false;
        if (query && !d.hospital_name.includes(query)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byType, statusFilter, query, siteType]
  );

  function handleCreate() {
    router.push("/deliveries/new");
  }

  function selectSiteType(t: "delivery" | "demo") {
    setSiteType(t);
    setStatusFilter("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {[
            { v: "delivery", l: "납품 & 관리" },
            { v: "demo", l: "DEMO" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => selectSiteType(t.v as "delivery" | "demo")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${siteType === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          <button
            onClick={() => setView("list")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${view === "list" ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            ☰ 목록
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${view === "kanban" ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            ⬛ 칸반
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="">전체 상태</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="병원명 검색..."
          className="w-52 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <button onClick={handleCreate} className="ml-auto rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
          + 새 납품 등록
        </button>
      </div>

      {loading && <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>}

      {!loading && view === "list" && (
        <div className="space-y-2">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => router.push(`/deliveries/${d.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{d.hospital_name}</div>
                <div className="mt-1 text-xs text-gray-400">설치일 {d.installation_date || "-"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    d.site_type === "demo"
                      ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                      : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                  }`}
                >
                  {d.site_type === "demo" ? "DEMO" : "납품 & 관리"}
                </span>
                {d.site_type === "demo" && d.demo_result && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${DEMO_RESULT_COLOR[d.demo_result] || "bg-gray-100 text-gray-500 dark:bg-white/10"}`}>
                    {d.demo_result}
                  </span>
                )}
                {d.site_type === "delivery" && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${MAINT_COLOR[maintenanceStatus(d)]}`}>
                    {maintenanceStatus(d)}
                  </span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">등록된 건이 없습니다</div>}
        </div>
      )}

      {!loading && view === "kanban" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statuses.map((s) => (
            <div key={s} className="rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.02]">
              <div className="mb-2 text-xs font-bold text-gray-500">
                {s} ({filtered.filter((d) => statusOf(d) === s).length})
              </div>
              <div className="space-y-2">
                {filtered
                  .filter((d) => statusOf(d) === s)
                  .map((d) => (
                    <button
                      key={d.id}
                      onClick={() => router.push(`/deliveries/${d.id}`)}
                      className="w-full rounded-lg border-l-4 bg-white p-3 text-left text-xs shadow-sm dark:bg-gray-900 border-brand-500"
                    >
                      <div className="font-semibold text-gray-800 dark:text-white/90">{d.hospital_name}</div>
                      <div className="mt-1 text-gray-400">설치일 {d.installation_date || "-"}</div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
