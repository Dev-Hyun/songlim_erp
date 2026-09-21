"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDeliveries, updateDelivery } from "./api";
import { DeliveryListItem, SiteType } from "./types";
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

// DEMO 장비 종류 — 목록에서 한눈에 갈리도록 종류마다 다른 색을 준다.
// 미지정(기존 행)은 회색으로 둬서 "아직 안 골랐다"가 보이게 한다.
const EQUIPMENT_KIND_CHIP: Record<string, string> = {
  초음파: "bg-brand-500/12 text-brand-700 dark:text-brand-300",
  "X-ray": "bg-warning-500/15 text-warning-700 dark:text-warning-300",
  기타: "bg-success-500/12 text-success-700 dark:text-success-300",
};

/** DEMO 목록 기본 조회 창: 과거는 3개월치만, 미래 예정 건은 기간 제한 없이 전부.
 *  기준은 DEMO 예정일(installation_date)이다. */
function defaultDemoFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return localISODate(d);
}
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

// fixedSiteType이 주어지면 탭 전환 없이 해당 site_type만 보여준다.
// DEMO가 /deliveries/demo로 분리된 뒤로는 이 화면(초음파 & 유지보수 현황)도 항상
// "delivery"로 고정해서 부른다 — 탭 자체가 이제 의미가 없다(DEMO는 다른 화면).
export default function DeliveriesListClient({ fixedSiteType }: { fixedSiteType?: SiteType } = {}) {
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [siteType, setSiteType] = useState<"delivery" | "demo">(fixedSiteType ?? "delivery");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  // DEMO 전용 기간 필터. from을 비우면 과거 전체, to를 비우면 미래 전체(기본값)를 본다.
  const [dateFrom, setDateFrom] = useState(fixedSiteType === "demo" ? defaultDemoFrom() : "");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const isDemoView = fixedSiteType === "demo";

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
        // 기간은 DEMO 예정일(installation_date) 기준. 예정일이 없는 건은 기간을
        // 판단할 수 없으므로 항상 남긴다(숨기면 입력 누락 건을 영영 못 찾는다).
        if (d.installation_date) {
          if (dateFrom && d.installation_date < dateFrom) return false;
          if (dateTo && d.installation_date > dateTo) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byType, statusFilter, query, siteType, dateFrom, dateTo]
  );

  function handleCreate() {
    router.push(fixedSiteType === "demo" ? "/deliveries/demo/new" : "/deliveries/new");
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
        {!fixedSiteType && (
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
        )}
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
        {fixedSiteType === "demo" && (
          // 기본은 "최근 3개월 + 앞으로 예정된 전부". 종료일을 비워두면 미래가 안 잘린다.
          <span className="flex flex-wrap items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="DEMO 예정일 시작"
              className="field date-picker-visible w-36"
            />
            <span className="fg-subtle text-ui-sm">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="DEMO 예정일 종료"
              className="field date-picker-visible w-36"
            />
            <button
              type="button"
              onClick={() => { setDateFrom(defaultDemoFrom()); setDateTo(""); }}
              className="btn btn-default"
              title="최근 3개월 + 앞으로 예정된 건 전부"
            >
              기본 기간
            </button>
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="btn btn-default"
            >
              전체 기간
            </button>
          </span>
        )}
        <span className="fg-subtle ml-auto hidden text-ui-sm sm:block">{filtered.length}건</span>
        <button onClick={handleCreate} className="btn btn-primary ml-auto sm:ml-0">
          {fixedSiteType === "demo" ? "새 DEMO 등록" : "새 납품 등록"}
        </button>
      </div>

      {loading && <div className="surface-card empty-state">불러오는 중...</div>}

      {!loading && view === "list" && (
        <div className="surface-card overflow-hidden">
          {/* DEMO는 상태 -> 장비종류 -> 병원 -> 구분 -> 예정일 -> 종료일 순서로 본다.
              납품&관리는 기존 순서를 그대로 유지한다(운영 중 화면이라 바꾸지 않는다). */}
          {isDemoView ? (
            <div className="hidden gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:grid sm:grid-cols-[150px_84px_1fr_80px_104px_104px]">
              <span className="label-eyebrow">상태</span>
              <span className="label-eyebrow">장비종류</span>
              <span className="label-eyebrow">병원</span>
              <span className="label-eyebrow">구분</span>
              <span className="label-eyebrow">DEMO 예정일</span>
              <span className="label-eyebrow">DEMO 종료일</span>
            </div>
          ) : (
            <div className="hidden gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:grid sm:grid-cols-[1fr_96px_88px_150px]">
              <span className="label-eyebrow">병원</span>
              <span className="label-eyebrow">구분</span>
              <span className="label-eyebrow">설치일</span>
              <span className="label-eyebrow text-right">상태</span>
            </div>
          )}
          {filtered.map((d) =>
            isDemoView ? (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/deliveries/${d.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/deliveries/${d.id}`); }}
                className="grid w-full cursor-pointer grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-b border-gray-100 px-3 py-3 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03] sm:grid-cols-[150px_84px_1fr_80px_104px_104px] sm:py-2"
              >
                <span className="flex" onClick={(e) => e.stopPropagation()}>
                  <StatusPicker d={d} onSetDemoResult={quickSetDemoResult} onSetMaintenance={quickSetMaintenance} />
                </span>
                <span className="hidden sm:block">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-ui-sm font-medium ${
                      EQUIPMENT_KIND_CHIP[d.equipment_kind || ""] ||
                      "bg-gray-200/70 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300"
                    }`}
                  >
                    {d.equipment_kind || "미지정"}
                  </span>
                </span>
                <span className="fg-strong min-w-0 truncate text-ui font-medium">{d.hospital_name}</span>
                <span className="fg-subtle hidden truncate text-ui-sm sm:block">{d.hospital_type || "-"}</span>
                <span className="fg-subtle hidden text-ui-sm tabular-nums sm:block">{d.installation_date || "-"}</span>
                <span className="fg-subtle hidden text-ui-sm tabular-nums sm:block">{d.warranty_end || "-"}</span>
                {/* 폰 전용 둘째 줄 — 데스크톱의 장비종류·구분·예정일·종료일을 여기 모아 전부 보여준다 */}
                <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-ui-sm font-medium ${
                      EQUIPMENT_KIND_CHIP[d.equipment_kind || ""] ||
                      "bg-gray-200/70 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300"
                    }`}
                  >
                    {d.equipment_kind || "미지정"}
                  </span>
                  <span className="fg-subtle text-ui-sm">{d.hospital_type || "구분 미지정"}</span>
                  <span className="fg-subtle text-ui-sm tabular-nums">
                    예정 {d.installation_date || "-"}
                  </span>
                  <span className="fg-subtle text-ui-sm tabular-nums">
                    종료 {d.warranty_end || "-"}
                  </span>
                </span>
              </div>
            ) : (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/deliveries/${d.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/deliveries/${d.id}`); }}
                className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-gray-100 px-3 py-3 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03] sm:grid-cols-[1fr_96px_88px_150px] sm:py-2"
              >
                <span className="fg-strong min-w-0 truncate text-ui font-medium">{d.hospital_name}</span>
                <span className="hidden sm:block">
                  <span className="chip-quiet">{d.site_type === "demo" ? "DEMO" : "납품·관리"}</span>
                </span>
                <span className="fg-subtle hidden text-ui-sm tabular-nums sm:block">{d.installation_date || "-"}</span>
                <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <StatusPicker d={d} onSetDemoResult={quickSetDemoResult} onSetMaintenance={quickSetMaintenance} />
                </span>
                {/* 폰 전용 둘째 줄 — 구분·설치일을 숨기지 않고 여기에 */}
                <span className="fg-subtle col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-ui-sm sm:hidden">
                  <span className="chip-quiet">{d.site_type === "demo" ? "DEMO" : "납품·관리"}</span>
                  <span className="tabular-nums">설치 {d.installation_date || "-"}</span>
                </span>
              </div>
            )
          )}
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
                      <div className="fg-subtle mt-0.5 text-ui-sm">
                        {isDemoView ? "DEMO 예정일" : "설치일"} {d.installation_date || "-"}
                      </div>
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
