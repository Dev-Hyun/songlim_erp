"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDeliveries, updateDelivery } from "./api";
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

// 로컬(KST) 달력 날짜를 YYYY-MM-DD로. toISOString()은 UTC로 변환하면서 자정~오전9시 사이에
// 하루 밀리는 문제가 있어(한국은 UTC+9) 쓰지 않는다.
function localISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// warranty_end(Warranty 종료일) 기준으로 유지보수 진행중/만료를 계산한다. 날짜가 없으면 아직 만료되지 않은 것으로 취급.
function maintenanceStatus(d: DeliveryListItem): string {
  if (!d.warranty_end) return "유지보수 진행중";
  return d.warranty_end >= localISODate(new Date()) ? "유지보수 진행중" : "유지보수 만료";
}

function StatusPicker({
  d,
  onSetDemoResult,
  onSetMaintenance,
}: {
  d: DeliveryListItem;
  onSetDemoResult: (d: DeliveryListItem, value: string) => void;
  onSetMaintenance: (d: DeliveryListItem, status: string) => void;
}) {
  if (d.site_type === "demo") {
    const current = d.demo_result || "";
    return (
      <select
        value={current}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSetDemoResult(d, e.target.value)}
        className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-bold ${DEMO_RESULT_COLOR[current] || "bg-gray-100 text-gray-500 dark:bg-white/10"}`}
      >
        <option value="">미정</option>
        {DEMO_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    );
  }
  const current = maintenanceStatus(d);
  return (
    <select
      value={current}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onSetMaintenance(d, e.target.value)}
      className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-bold ${MAINT_COLOR[current]}`}
    >
      {MAINT_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
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

  // 목록/칸반에 떠 있는 상태 배지를 클릭해서 바로 바꿀 수 있게 — 상세 수정 화면에 들어가지 않아도 됨.
  // 납품&관리는 별도 상태 컬럼이 없고 warranty_end(Warranty 종료일) 기준 계산값이므로, "진행중"은
  // 종료일을 비워서(무기한) 표현하고 "만료"는 어제 날짜로 세팅해 즉시 만료 처리한다.
  async function quickSetDemoResult(d: DeliveryListItem, value: string) {
    await updateDelivery(d.id, { demo_result: value });
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, demo_result: value } : x)));
  }

  async function quickSetMaintenance(d: DeliveryListItem, status: string) {
    const warranty_end = status === "유지보수 만료" ? localISODate(new Date(Date.now() - 86400000)) : null;
    await updateDelivery(d.id, { warranty_end });
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, warranty_end } : x)));
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
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/deliveries/${d.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") router.push(`/deliveries/${d.id}`); }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
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
                <StatusPicker d={d} onSetDemoResult={quickSetDemoResult} onSetMaintenance={quickSetMaintenance} />
              </div>
            </div>
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
                    <div
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/deliveries/${d.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/deliveries/${d.id}`); }}
                      className="w-full cursor-pointer rounded-lg border-l-4 bg-white p-3 text-left text-xs shadow-sm dark:bg-gray-900 border-brand-500"
                    >
                      <div className="font-semibold text-gray-800 dark:text-white/90">{d.hospital_name}</div>
                      <div className="mt-1 text-gray-400">설치일 {d.installation_date || "-"}</div>
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <StatusPicker d={d} onSetDemoResult={quickSetDemoResult} onSetMaintenance={quickSetMaintenance} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
