"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDeliveries, updateDelivery } from "./api";
import { DeliveryListItem } from "./types";
import { localISODate } from "@/lib/date";

// 상태는 셀렉트 왼쪽의 작은 색 점으로만 구분한다(배경을 전부 칠하는 알약 배지 대체).
const DEMO_RESULT_DOT: Record<string, string> = {
  "": "bg-gray-300 dark:bg-gray-600",
  예정: "bg-gray-400 dark:bg-gray-500",
  진행중: "bg-warning-500",
  성공: "bg-success-500",
  실패: "bg-error-500",
};

const DEMO_STATUSES = ["예정", "진행중", "성공", "실패"] as const;
const MAINT_STATUSES = ["유지보수 진행중", "유지보수 만료"] as const;

const MAINT_DOT: Record<string, string> = {
  "유지보수 진행중": "bg-success-500",
  "유지보수 만료": "bg-error-500",
};

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
      <span className="inline-flex items-center gap-1.5">
        <span className={`dot ${DEMO_RESULT_DOT[current] || DEMO_RESULT_DOT[""]}`} />
        <select
          value={current}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSetDemoResult(d, e.target.value)}
          className="field h-7 cursor-pointer px-1.5 text-ui-sm"
        >
          <option value="">미정</option>
          {DEMO_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </span>
    );
  }
  const current = maintenanceStatus(d);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`dot ${MAINT_DOT[current]}`} />
      <select
        value={current}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSetMaintenance(d, e.target.value)}
        className="field h-7 cursor-pointer px-1.5 text-ui-sm"
      >
        {MAINT_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </span>
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
    <div className="space-y-3">
      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="seg">
          {[
            { v: "delivery", l: "납품 & 관리" },
            { v: "demo", l: "DEMO" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => selectSiteType(t.v as "delivery" | "demo")}
              className={`seg-item ${siteType === t.v ? "seg-item-on" : ""}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="seg">
          <button
            onClick={() => setView("list")}
            className={`seg-item ${view === "list" ? "seg-item-on" : ""}`}
          >
            목록
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`seg-item ${view === "kanban" ? "seg-item-on" : ""}`}
          >
            칸반
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="field"
        >
          <option value="">전체 상태</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="병원명 검색"
          className="field w-40 sm:w-52"
        />
        <span className="fg-subtle ml-auto hidden text-ui-sm sm:block">{filtered.length}건</span>
        <button onClick={handleCreate} className="btn btn-primary ml-auto sm:ml-0">
          새 납품 등록
        </button>
      </div>

      {loading && <div className="surface-card empty-state">불러오는 중...</div>}

      {!loading && view === "list" && (
        <div className="surface-card overflow-hidden">
          <div className="hidden gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:grid sm:grid-cols-[1fr_96px_88px_150px]">
            <span className="label-eyebrow">병원</span>
            <span className="label-eyebrow">구분</span>
            <span className="label-eyebrow">설치일</span>
            <span className="label-eyebrow text-right">상태</span>
          </div>
          {filtered.map((d) => (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/deliveries/${d.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter") router.push(`/deliveries/${d.id}`); }}
              className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b border-gray-100 px-3 py-2 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03] sm:grid-cols-[1fr_96px_88px_150px]"
            >
              <span className="fg-strong min-w-0 truncate text-ui font-medium">{d.hospital_name}</span>
              <span className="hidden sm:block">
                <span className="chip-quiet">{d.site_type === "demo" ? "DEMO" : "납품·관리"}</span>
              </span>
              <span className="fg-subtle hidden text-ui-sm tabular-nums sm:block">{d.installation_date || "-"}</span>
              <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <StatusPicker d={d} onSetDemoResult={quickSetDemoResult} onSetMaintenance={quickSetMaintenance} />
              </span>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty-state">등록된 건이 없습니다</div>}
        </div>
      )}

      {!loading && view === "kanban" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statuses.map((s) => (
            <div key={s} className="surface-sub rounded-card border border-gray-200 p-2 dark:border-gray-800">
              <div className="mb-2 flex items-center gap-1.5 px-1 py-0.5">
                <span className="fg-base text-ui font-medium">{s}</span>
                <span className="fg-subtle text-ui-sm tabular-nums">
                  {filtered.filter((d) => statusOf(d) === s).length}
                </span>
              </div>
              <div className="space-y-1.5">
                {filtered
                  .filter((d) => statusOf(d) === s)
                  .map((d) => (
                    <div
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/deliveries/${d.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/deliveries/${d.id}`); }}
                      className="w-full cursor-pointer rounded-control border border-gray-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                    >
                      <div className="fg-strong truncate text-ui font-medium">{d.hospital_name}</div>
                      <div className="fg-subtle mt-0.5 text-ui-sm">설치일 {d.installation_date || "-"}</div>
                      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
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
