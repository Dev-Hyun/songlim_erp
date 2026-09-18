"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CategorySummary,
  EquipmentSearchItem,
  EquipmentSearchResult,
  ManufacturerRow,
  MedMeta,
  ModelRow,
  fetchEquipmentByCategory,
  fetchEquipmentSearch,
  fetchManufacturers,
  fetchMedMeta,
  fetchMedSigungu,
  fetchModels,
} from "./api";
import { EmptyState, Pagination, Panel, StatTile, inputClass, selectClass, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const PAGE_SIZE = 20;
/** 심평원 장비 분류가 195종이라 카드/차트는 상위 N개만 그리고 나머지는 접어둔다. */
const TOP_N = 12;
type Browse = "hospital" | "manufacturer" | "model";

export default function EquipmentSearchClient() {
  const chart = useChartTheme();
  const [meta, setMeta] = useState<MedMeta | null>(null);
  const [sigunguList, setSigunguList] = useState<string[]>([]);

  // 필터 (입력 중인 값) — 검색 버튼을 눌러야 applied로 넘어간다
  const [year, setYear] = useState(2025);
  const [category, setCategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [typeGroup, setTypeGroup] = useState("");
  const [hospitalQ, setHospitalQ] = useState("");
  const [sort, setSort] = useState("units");

  const [applied, setApplied] = useState<Record<string, string | number> | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<EquipmentSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [showAllCats, setShowAllCats] = useState(false);
  const [browse, setBrowse] = useState<Browse>("hospital");
  const [makerRows, setMakerRows] = useState<ManufacturerRow[]>([]);
  const [modelRows, setModelRows] = useState<ModelRow[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetchMedMeta()
      .then((m) => {
        setMeta(m);
        if (m.years.length) setYear(m.years[0]);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!sido) return;
    fetchMedSigungu(sido).then(setSigunguList).catch(() => setSigunguList([]));
  }, [sido]);

  // 시도를 바꾸면 하위 시군구 선택은 무효 — effect가 아니라 이벤트 핸들러에서 같이 처리한다
  function changeSido(next: string) {
    setSido(next);
    setSigungu("");
    if (!next) setSigunguList([]);
  }

  // 분류별 요약은 지역/종별/연도만 따라간다 (검색 버튼과 무관하게 즉시 반영)
  useEffect(() => {
    fetchEquipmentByCategory({ year, sido, sigungu, type_group: typeGroup })
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [year, sido, sigungu, typeGroup]);

  // 제조사 목록은 드롭다운도 같이 쓰므로 브라우즈 탭과 무관하게 항상 받아둔다
  useEffect(() => {
    fetchManufacturers({ category, year }).then(setMakerRows).catch(() => setMakerRows([]));
  }, [category, year]);

  useEffect(() => {
    if (browse !== "model") return;
    fetchModels({ category, year, manufacturer, q: model, limit: 100 })
      .then(setModelRows)
      .catch(() => setModelRows([]));
  }, [browse, category, year, manufacturer, model]);

  const runSearch = useCallback(
    (nextPage: number, params: Record<string, string | number>) => {
      setLoading(true);
      setError("");
      fetchEquipmentSearch({ ...params, page: nextPage, page_size: PAGE_SIZE } as Parameters<
        typeof fetchEquipmentSearch
      >[0])
        .then(setResult)
        .catch((e) => {
          setError(e.message);
          setResult(null);
        })
        .finally(() => setLoading(false));
    },
    []
  );

  function submit() {
    const params = {
      year,
      category,
      manufacturer,
      model,
      sido,
      sigungu,
      type_group: typeGroup,
      hospital_q: hospitalQ,
      sort,
    };
    setApplied(params);
    setPage(1);
    setExpanded(null);
    runSearch(1, params);
  }

  function goPage(p: number) {
    if (!applied) return;
    setPage(p);
    setExpanded(null);
    runSearch(p, applied);
  }

  function reset() {
    setCategory("");
    setManufacturer("");
    setModel("");
    changeSido("");
    setTypeGroup("");
    setHospitalQ("");
    setApplied(null);
    setResult(null);
    setError("");
  }

  const shownCats = showAllCats ? categories : categories.slice(0, TOP_N);
  const chartCats = categories.slice(0, TOP_N);

  // 분류별 보유 기관 수 — 단일 시리즈이므로 범례 없이 색 하나
  const catOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
    xaxis: { categories: chartCats.map((c) => c.label), labels: { ...chart.axisLabel, rotate: -45, trim: true, maxHeight: 90 } },
    yaxis: { labels: { ...chart.axisLabel, formatter: (v: number) => Math.round(v).toLocaleString() } },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}개 기관` } },
  };

  return (
    <div className="space-y-6">
      {/* 검색 폼 */}
      <Panel title="장비 조건 검색" desc="분류·제조사·모델·지역·연도로 보유 기관을 찾거나, 병원명으로 그 병원의 보유 장비 전체를 확인합니다.">
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
            {(meta?.years || [year]).map((y) => (
              <option key={y} value={y}>
                {y}년 기준
              </option>
            ))}
          </select>
          <CategoryPicker
            options={meta?.categories || []}
            value={category}
            onChange={(next) => {
              setCategory(next);
              setManufacturer("");
            }}
          />
          <select value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className={selectClass}>
            <option value="">전체 제조사</option>
            {makerRows.map((m) => (
              <option key={m.manufacturer} value={m.manufacturer}>
                {m.manufacturer}
              </option>
            ))}
          </select>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="모델명 (부분 일치)"
            className={`${inputClass} w-44`}
          />
          <select value={sido} onChange={(e) => changeSido(e.target.value)} className={selectClass}>
            <option value="">전체 시도</option>
            {(meta?.sidos || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sigungu}
            onChange={(e) => setSigungu(e.target.value)}
            disabled={!sido}
            className={`${selectClass} disabled:opacity-40`}
          >
            <option value="">전체 시군구</option>
            {sigunguList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={typeGroup} onChange={(e) => setTypeGroup(e.target.value)} className={selectClass}>
            <option value="">전체 종별</option>
            {(meta?.type_groups || []).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={hospitalQ}
            onChange={(e) => setHospitalQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="병원명 검색"
            className={`${inputClass} w-44`}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
            <option value="units">보유 대수순</option>
            <option value="name">병원명순</option>
            <option value="region">지역순</option>
          </select>
          <button
            onClick={submit}
            className="h-9 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            검색
          </button>
          <button
            onClick={reset}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
          >
            초기화
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </Panel>

      {/* 분류 브라우즈 — 195종이라 보유 대수 상위 N종만 카드로 펼치고 나머지는 접어둔다 */}
      <div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {shownCats.map((c) => (
            <button
              key={c.category}
              onClick={() => setCategory(c.category === category ? "" : c.category)}
              className={`surface-card p-3 text-left transition-colors ${
                category === c.category ? "border-gray-900 dark:border-white" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <div className="fg-muted truncate text-ui-xs font-medium" title={c.label}>
                {c.label}
              </div>
              <div className="fg-strong mt-1 text-ui-xl font-semibold tabular-nums">
                {c.hospitals.toLocaleString()}
              </div>
              <div className="fg-subtle mt-0.5 text-ui-xs tabular-nums">
                보유 기관 · {c.units.toLocaleString()}대 · 모델 {c.models.toLocaleString()}종
              </div>
            </button>
          ))}
        </div>
        {categories.length > TOP_N && (
          <button className="btn btn-default mt-3" onClick={() => setShowAllCats(!showAllCats)}>
            {showAllCats ? "상위 12종만 보기" : `전체 ${categories.length.toLocaleString()}종 보기`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title="분류별 보유 기관 수"
          desc={`${year}년 기준 · 보유 대수 상위 ${TOP_N}종${sido ? ` · ${sido}${sigungu ? ` ${sigungu}` : ""}` : " · 전국"}`}
        >
          {chartCats.length ? (
            <ReactApexChart
              key={`cat-${year}-${sido}-${sigungu}-${typeGroup}-${chart.dark}`}
              options={catOptions}
              series={[{ name: "보유 기관", data: chartCats.map((c) => c.hospitals) }]}
              type="bar"
              height={260}
            />
          ) : (
            <EmptyState message="데이터가 없습니다." />
          )}
        </Panel>

        {/* 제조사/모델 브라우즈 */}
        <Panel
          title="제조사 · 모델 브라우즈"
          desc="행을 누르면 해당 조건으로 검색 필터가 채워집니다."
          className="xl:col-span-2"
          right={
            <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.06]">
              {(["manufacturer", "model"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrowse(b)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    browse === b ? "bg-brand-500 text-white" : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {b === "manufacturer" ? "제조사" : "모델"}
                </button>
              ))}
            </div>
          }
        >
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2 text-left font-medium">{browse === "manufacturer" ? "제조사" : "모델"}</th>
                  {browse === "model" && <th className="py-2 text-left font-medium">제조사</th>}
                  <th className="py-2 text-right font-medium">보유 기관</th>
                  <th className="py-2 text-right font-medium">대수</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(browse === "manufacturer" ? makerRows : modelRows).map((r, i) => {
                  const isMaker = browse === "manufacturer";
                  const label = isMaker ? (r as ManufacturerRow).manufacturer : (r as ModelRow).model;
                  return (
                    <tr
                      key={`${label}-${i}`}
                      onClick={() => {
                        if (isMaker) setManufacturer(label);
                        else {
                          const m = r as ModelRow;
                          setCategory(m.category);
                          setManufacturer(m.manufacturer || "");
                          setModel(m.model);
                        }
                      }}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
                    >
                      <td className="py-2 pr-2 text-gray-800 dark:text-gray-200">{label}</td>
                      {!isMaker && (
                        <td className="py-2 pr-2 text-gray-500 dark:text-gray-400">{(r as ModelRow).manufacturer}</td>
                      )}
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                        {r.hospitals.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{r.units.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {(browse === "manufacturer" ? makerRows : modelRows).length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="목록이 비어 있습니다." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* 검색 결과 */}
      <Panel
        title="검색 결과"
        desc={
          applied
            ? "기관명을 누르면 해당 연도의 보유 장비 전체가 펼쳐집니다."
            : "조건을 선택하고 검색을 누르세요."
        }
      >
        {result && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="검색된 기관" value={result.total} />
            <StatTile label="조건 일치 장비" value={result.total_units} sub="대" />
          </div>
        )}
        {loading && <EmptyState message="불러오는 중..." />}
        {!loading && !result && <EmptyState message="검색 조건을 입력해 주세요." />}
        {!loading && result && result.items.length === 0 && <EmptyState message="조건에 맞는 의료기관이 없습니다." />}
        {!loading && result && result.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-gray-500 dark:text-gray-400">
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="py-2 text-left font-medium">의료기관</th>
                    <th className="py-2 text-left font-medium">종별</th>
                    <th className="py-2 text-left font-medium">지역</th>
                    <th className="py-2 text-left font-medium">일치 장비</th>
                    <th className="py-2 text-right font-medium">대수</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((h) => (
                    <HospitalRowView
                      key={h.hospital_id}
                      item={h}
                      year={year}
                      open={expanded === h.hospital_id}
                      onToggle={() => setExpanded(expanded === h.hospital_id ? null : h.hospital_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={goPage} />
          </>
        )}
      </Panel>
    </div>
  );
}

/**
 * 장비 분류 선택 — 심평원 전체 장비군이 195종이라 <select>로는 못 고른다.
 * 버튼 + 팝오버(검색 입력 + 필터된 목록) 구조. 목록은 서버가 보유 행수 많은 순으로 내려준다.
 */
function CategoryPicker({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; rows: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
    );
  }, [options, q]);

  const current = options.find((o) => o.value === value);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${selectClass} flex w-56 items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${current ? "" : "fg-muted"}`}>{current ? current.label : "전체 장비 분류"}</span>
        <span className="fg-subtle shrink-0 text-ui-xs">▾</span>
      </button>
      {open && (
        <div className="surface-card absolute left-0 top-10 z-30 w-72 p-2 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="분류명 검색 (예: 초음파, 레이저, C108)"
            className={`${inputClass} w-full`}
          />
          <div className="custom-scrollbar mt-2 max-h-72 overflow-y-auto">
            <button type="button" className="list-row" onClick={() => pick("")}>
              <span className="fg-base flex-1 text-ui">전체 장비 분류</span>
            </button>
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => pick(o.value)}
                className={`list-row ${o.value === value ? "bg-gray-100 dark:bg-white/[0.06]" : ""}`}
              >
                <span className="fg-base min-w-0 flex-1 truncate text-ui" title={o.label}>
                  {o.label}
                </span>
                <span className="fg-subtle shrink-0 text-ui-xs tabular-nums">{o.rows.toLocaleString()}</span>
              </button>
            ))}
            {filtered.length === 0 && <EmptyState message="일치하는 분류가 없습니다." />}
          </div>
        </div>
      )}
    </div>
  );
}

function HospitalRowView({
  item,
  year,
  open,
  onToggle,
}: {
  item: EquipmentSearchItem;
  year: number;
  open: boolean;
  onToggle: () => void;
}) {
  const matched = item.matched_equipment.slice(0, 3);
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
      >
        <td className="py-2.5 pr-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-gray-800 dark:text-gray-100">{item.name}</span>
            {item.is_member && (
              <span className="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                회원
              </span>
            )}
          </div>
          {item.address && (
            <div className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{item.address}</div>
          )}
        </td>
        <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{item.type || "-"}</td>
        <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">
          {item.sido} {item.sigungu}
        </td>
        <td className="py-2.5 pr-3">
          <div className="flex flex-wrap gap-1">
            {matched.map((e, i) => (
              <span
                key={i}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
              >
                {e.label} {e.model}
              </span>
            ))}
            {item.matched_equipment.length > matched.length && (
              <span className="text-[11px] text-gray-400">+{item.matched_equipment.length - matched.length}</span>
            )}
          </div>
        </td>
        <td className="py-2.5 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-100">
          {item.matched_units.toLocaleString()}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 dark:border-gray-800">
          <td colSpan={5} className="bg-gray-50 px-3 py-3 dark:bg-white/[0.03]">
            <div className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              {year}년 보유 장비 전체 ({item.equipment.length}건)
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {item.equipment.map((e, i) => (
                <div key={i} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 font-medium text-brand-600 dark:text-brand-400">
                    {e.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                    {e.manufacturer} {e.model}
                  </span>
                  <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{e.count}대</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
