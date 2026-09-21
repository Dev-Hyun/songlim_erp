"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { useEffect, useState } from "react";
import {
  OpeningItem,
  OpeningStatus,
  OpeningsDeptMixData,
  OpeningsHeatmapData,
  OpeningsListData,
  OpeningsMeta,
  OpeningsSummaryData,
  OpeningsTrendData,
  fetchOpeningsDeptMix,
  fetchOpeningsHeatmap,
  fetchOpeningsList,
  fetchOpeningsMeta,
  fetchOpeningsSummary,
  fetchOpeningsTrend,
} from "./api";
import { TermsFaq } from "./CatalogParts";
import { EmptyState, Pagination, Panel, StatTile, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const PAGE_SIZE = 20;
/** 하이픈(-)이 아니라 수학 빼기 기호. 음수 증감을 숫자와 같은 폭으로 보이게 한다. */
const MINUS = "−";

type Filters = {
  category: string;
  days: number;
  sido: string;
  sigungu: string;
  status: OpeningStatus;
  q: string;
};

/** 메디하루 번들의 기본 상태와 같은 값 — 기간 90일, 상태 '영업/정상'. */
const DEFAULTS: Filters = {
  category: "clinics",
  days: 90,
  sido: "",
  sigungu: "",
  status: "영업/정상",
  q: "",
};

const STATUS_DOT: Record<OpeningStatus, string> = {
  "영업/정상": "bg-success-500",
  휴업: "bg-warning-500",
  폐업: "bg-error-500",
  "취소/말소/정지": "bg-gray-400",
};

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? MINUS : "");
const signedCount = (n: number) => `${sign(n)}${Math.abs(n).toLocaleString()}`;
const signedPp = (n: number) => `${sign(n)}${Math.abs(n).toFixed(1)}%p`;

/** "2026-03" → "3월". Date로 파싱하지 않으므로 시간대 영향이 없다. */
const monthLabel = (m: string) => `${Number(m.slice(5, 7))}월`;

/** 히트맵 셀 농도 — 건수 차이가 클수록 진해지되, 글자가 계속 읽히도록 최대 45%에서 멈춘다. */
function cellTint(value: number, max: number, base: string) {
  if (!value || max <= 0) return undefined;
  const t = Math.sqrt(value / max);
  const alpha = Math.round((0.1 + 0.35 * t) * 255);
  return { backgroundColor: `${base}${alpha.toString(16).padStart(2, "0")}` };
}

/** 필터 한 칸 — 라벨을 컨트롤 위에 붙여 둔다. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="label-eyebrow">{label}</span>
      {children}
    </label>
  );
}

export default function OpeningsClient() {
  const chart = useChartTheme();

  const [meta, setMeta] = useState<OpeningsMeta | null>(null);
  // 입력 중인 값(draft)과 실제 조회에 쓰인 값(applied)을 나눈다.
  // 메디하루와 동일하게 탭만 즉시 반영이고, 기간·지역·상태·검색어는 '검색'을 눌러야 적용된다.
  const [draft, setDraft] = useState<Filters>(DEFAULTS);
  const [applied, setApplied] = useState<Filters>(DEFAULTS);
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState<OpeningsSummaryData | null>(null);
  const [trend, setTrend] = useState<OpeningsTrendData | null>(null);
  const [deptMix, setDeptMix] = useState<OpeningsDeptMixData | null>(null);
  const [heat, setHeat] = useState<OpeningsHeatmapData | null>(null);
  const [list, setList] = useState<OpeningsListData | null>(null);

  // 행을 누르면 열리는 상세 팝오버 (페이지 이동이 아니다 — 메디하루 3-9와 같다).
  const [picked, setPicked] = useState<OpeningItem | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOpeningsMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  const { category, days } = applied;

  // 핵심요약·차트는 탭과 조회 기간만 따라간다 (지역·상태 필터는 목록 전용).
  // 로딩 플래그는 effect가 아니라 조작 핸들러에서 켠다 (effect 안 동기 setState 금지 규칙).
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchOpeningsSummary({ category }),
      fetchOpeningsTrend({ category }),
      fetchOpeningsDeptMix({ category, days }),
      fetchOpeningsHeatmap({ category, days }),
    ])
      .then(([s, t, d, h]) => {
        if (!alive) return;
        setError("");
        setPending(!s.available);
        setSummary(s.available ? s : null);
        setTrend(t.available ? t : null);
        setDeptMix(d.available ? d : null);
        setHeat(h.available ? h : null);
      })
      .catch(() => {
        if (alive) setError("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [category, days]);

  useEffect(() => {
    let alive = true;
    fetchOpeningsList({ ...applied, page, page_size: PAGE_SIZE })
      .then((r) => {
        if (alive) setList(r.available ? r : null);
      })
      .catch(() => {
        if (alive) setList(null);
      })
      .finally(() => {
        if (alive) setListLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [applied, page]);

  function commit(next: Filters) {
    // 지역·상태만 바꿨다면 차트는 그대로 두고 목록만 다시 그린다.
    if (next.category !== applied.category || next.days !== applied.days) setLoading(true);
    setListLoading(true);
    setApplied(next);
    setPage(1);
  }

  function goPage(next: number) {
    setListLoading(true);
    setPage(next);
  }

  /** 탭은 현재 입력값을 그대로 들고 즉시 조회한다 (메디하루 onClick 동작). */
  function pickTab(next: string) {
    const f = { ...draft, category: next };
    setDraft(f);
    commit(f);
  }

  function pickSido(next: string) {
    // 시도를 바꾸면 시군구는 항상 '전체'로 되돌린다.
    setDraft((d) => ({ ...d, sido: next, sigungu: "" }));
  }

  function reset() {
    setDraft(DEFAULTS);
    commit(DEFAULTS);
  }

  const periods = meta?.periods ?? [{ value: 90, label: "최근 90일" }];
  const statuses = meta?.statuses ?? [];
  const sidos = meta?.sidos ?? [];
  const sigunguList = sidos.find((s) => s.value === draft.sido)?.sigungus ?? [];
  const periodLabel = periods.find((p) => p.value === applied.days)?.label ?? `최근 ${applied.days}일`;
  const asOf = meta?.as_of ?? summary?.as_of ?? "";
  const isOpenStatus = applied.status === "영업/정상";

  const points = trend?.points ?? [];
  const trendOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar", stacked: true },
    // 신규(파랑) 위 / 폐업(주황)·취소(분홍)·휴업(노랑) 아래 — 인접 계열끼리 색상이 붙지 않게 골랐다.
    colors: [chart.series[0], chart.series[1], chart.series[4], chart.series[3]],
    plotOptions: { bar: { columnWidth: "58%", borderRadius: 2 } },
    legend: { ...chart.base.legend, position: "top", horizontalAlign: "left" },
    xaxis: {
      categories: points.map((p) => monthLabel(p.month)),
      labels: { ...chart.axisLabel, rotate: 0 },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { ...chart.axisLabel, formatter: (v: number) => Math.abs(Math.round(v)).toLocaleString() },
    },
    tooltip: {
      ...chart.base.tooltip,
      shared: true,
      intersect: false,
      y: { formatter: (v: number) => `${Math.abs(v).toLocaleString()}건` },
    },
  };

  const donutOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "donut" },
    labels: ["수도권", "비수도권"],
    colors: [chart.series[0], chart.series[1]],
    legend: { ...chart.base.legend, position: "bottom" },
    plotOptions: { pie: { donut: { size: "66%" } } },
    stroke: { width: 0 },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}건` } },
  };

  const mixRows = deptMix?.rows ?? [];
  const mixMax = Math.max(1, ...mixRows.map((r) => Math.abs(r.diff)));
  const topCellKeys = new Set((heat?.top_cells ?? []).map((c) => `${c.row}-${c.col}`));

  return (
    <div className="space-y-6">
      <Panel>
        <p className="fg-subtle text-ui-xs">인허가 등록 기준이라 실제 개원일과 차이가 있을 수 있습니다.</p>

        <div className="mt-3 seg" role="group" aria-label="개설 기관 구분">
          {(meta?.categories ?? [{ value: "clinics", label: "신규 의원", available: true }]).map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={draft.category === c.value}
              onClick={() => pickTab(c.value)}
              className={`seg-item ${draft.category === c.value ? "seg-item-on" : ""}`}
            >
              {c.label}
              {!c.available && <span className="chip-quiet ml-1">준비 중</span>}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="조회 기간">
            <select
              value={draft.days}
              onChange={(e) => setDraft((d) => ({ ...d, days: Number(e.target.value) }))}
              className="field"
            >
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="시도">
            <select value={draft.sido} onChange={(e) => pickSido(e.target.value)} className="field">
              <option value="">전체</option>
              {sidos.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="시군구">
            <select
              value={draft.sigungu}
              onChange={(e) => setDraft((d) => ({ ...d, sigungu: e.target.value }))}
              disabled={!draft.sido || sigunguList.length === 0}
              className="field disabled:opacity-40"
            >
              <option value="">전체</option>
              {sigunguList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="상태">
            <select
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as OpeningStatus }))}
              className="field"
            >
              {(statuses.length ? statuses : [{ value: DEFAULTS.status, date_label: "개설일" }]).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="병원명">
            <input
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && commit(draft)}
              placeholder="병원명 검색"
              className="field w-44"
            />
          </Field>
          <button type="button" className="btn btn-primary" onClick={() => commit(draft)}>
            검색
          </button>
          <button type="button" className="btn btn-default" onClick={reset}>
            조건 초기화
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </Panel>

      {pending && (
        <Panel title="데이터 준비 중">
          <EmptyState message="병원급 인허가(개설·등록) 데이터는 아직 제공되지 않습니다. 의원 탭을 이용해 주세요." />
        </Panel>
      )}

      {loading && !pending && <EmptyState message="조회 중입니다 (수 초 걸릴 수 있어요)" />}

      {!loading && summary && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="최근 30일 신규 개설"
              value={summary.recent30.count}
              sub={`최근 90일의 30일 환산 평균(약 ${summary.baseline30.toLocaleString()}건)보다 ${Math.abs(
                summary.gap_vs_baseline,
              ).toLocaleString()}건 ${
                summary.gap_vs_baseline > 0 ? "많음" : summary.gap_vs_baseline < 0 ? "적음" : "같음"
              }`}
            />
            <StatTile
              label="직전 30일 대비"
              value={`${signedCount(summary.delta_vs_prev30)}건`}
              sub={`직전 30일 ${summary.prev30.count.toLocaleString()}건 · ${summary.prev30.start} ~ ${summary.prev30.end}`}
            />
            <StatTile
              label="수도권 신규 개설 비중"
              value={`${summary.metro.share.toFixed(1)}%`}
              sub={`${summary.metro.count.toLocaleString()}건 · 비수도권 ${summary.metro.non_count.toLocaleString()}건`}
            />
            <StatTile
              label="개설 증가폭 최대 지역"
              value={summary.top_region ? `${summary.top_region.sido} ${summary.top_region.sigungu}` : "—"}
              sub={
                summary.top_region
                  ? `직전 30일보다 ${summary.top_region.delta.toLocaleString()}건 증가 (${summary.top_region.recent.toLocaleString()}건)`
                  : "최소 표본 임계를 넘는 지역이 없습니다"
              }
            />
          </div>

          <Panel title="이번 달 주요 변화" desc="개설 데이터에서 관찰된 변화">
            <ul className="space-y-2">
              {summary.insights.map((line) => (
                <li key={line} className="fg-base flex gap-2 text-ui">
                  <span className="dot mt-2 bg-gray-300 dark:bg-gray-600" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
            <p className="fg-subtle mt-3 text-ui-xs">
              1~2건 수준의 단순 변동은 제외합니다. 특정 지역에 대한 추천·전망·평가가 아닙니다.
            </p>
          </Panel>

          <Panel
            title="개설 추이"
            desc="최근 12개월 · 신규 개설과 폐업·휴업"
            right={
              trend && (
                <span className="chip">
                  최근 3개월 월평균 개설 {trend.avg_recent3.toLocaleString()}건
                </span>
              )
            }
          >
            {points.length ? (
              <>
                <ReactApexChart
                  key={`trend-${category}-${chart.dark}`}
                  options={trendOptions}
                  series={[
                    { name: "신규 개설", data: points.map((p) => p.opened) },
                    { name: "폐업", data: points.map((p) => -p.closed) },
                    { name: "취소·말소·정지", data: points.map((p) => -p.revoked) },
                    { name: "휴업", data: points.map((p) => -p.suspended) },
                  ]}
                  type="bar"
                  height={300}
                />
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="table-cards table-dense">
                    <thead>
                      <tr>
                        <th className="th-dense th-sticky">월</th>
                        <th className="th-dense th-sticky text-right">신규 개설</th>
                        <th className="th-dense th-sticky text-right">폐업</th>
                        <th className="th-dense th-sticky text-right">취소·말소·정지</th>
                        <th className="th-dense th-sticky text-right">휴업</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {points.map((p) => (
                        <tr key={p.month} className="row-hover">
                          <td data-label="월" className="td-dense whitespace-nowrap">
                            {p.month}
                            {p.partial && <span className="chip-quiet ml-1">진행 중</span>}
                          </td>
                          <td data-label="신규 개설" className="td-dense fg-strong text-right font-medium">
                            {p.opened.toLocaleString()}
                          </td>
                          <td data-label="폐업" className="td-dense text-right">{p.closed.toLocaleString()}</td>
                          <td data-label="취소·말소·정지" className="td-dense text-right">{p.revoked.toLocaleString()}</td>
                          <td data-label="휴업" className="td-dense text-right">{p.suspended.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="fg-subtle mt-2 text-ui-xs leading-relaxed">
                  단위: 건 · 기준선 위는 인허가일 기준 신규 개설, 아래는 그 달에 폐업(폐업일)하거나 휴업을
                  시작(휴업 시작일)한 기관 수입니다. 폐업·휴업은 개설 시기와 관계없이 셉니다. 이번 달은 기준일까지의
                  진행 중 집계입니다.
                </p>
              </>
            ) : (
              <EmptyState message="데이터가 없습니다." />
            )}
          </Panel>

          <div className={`grid grid-cols-1 gap-6 ${category === "hospitals" ? "" : "xl:grid-cols-2"}`}>
            <Panel title="수도권 vs 비수도권" desc="최근 30일 개설">
              {summary.recent30.count ? (
                <>
                  <ReactApexChart
                    key={`metro-${category}-${chart.dark}`}
                    options={donutOptions}
                    series={[summary.metro.count, summary.metro.non_count]}
                    type="donut"
                    height={260}
                  />
                  <div className="mt-2 overflow-x-auto">
                    <table className="table-cards table-dense">
                      <thead>
                        <tr>
                          <th className="th-dense">권역</th>
                          <th className="th-dense text-right">건수</th>
                          <th className="th-dense text-right">비중</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        <tr className="row-hover">
                          <td data-label="권역" className="td-dense">수도권</td>
                          <td data-label="건수" className="td-dense fg-strong text-right font-medium">
                            {summary.metro.count.toLocaleString()}
                          </td>
                          <td data-label="비중" className="td-dense text-right">{summary.metro.share.toFixed(1)}%</td>
                        </tr>
                        <tr className="row-hover">
                          <td data-label="권역" className="td-dense">비수도권</td>
                          <td data-label="건수" className="td-dense fg-strong text-right font-medium">
                            {summary.metro.non_count.toLocaleString()}
                          </td>
                          <td data-label="비중" className="td-dense text-right">{summary.metro.non_share.toFixed(1)}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="fg-muted mt-2 text-ui-sm">{summary.metro_summary}</p>
                </>
              ) : (
                <EmptyState message="최근 30일 신규 개설이 없습니다." />
              )}
            </Panel>

            {category !== "hospitals" && (
            <Panel
              title="권역 간 진료과 구성비 차이 Top"
              desc={`막대가 오른쪽이면 수도권이, 왼쪽이면 비수도권이 높습니다 (${periodLabel})`}
            >
              {mixRows.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="table-cards table-dense min-w-[420px]">
                      <thead>
                        <tr>
                          <th className="th-dense">진료과</th>
                          <th className="th-dense">차이</th>
                          <th className="th-dense text-right">차이(%p)</th>
                          <th className="th-dense text-right">수도권</th>
                          <th className="th-dense text-right">비수도권</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {mixRows.map((r) => {
                          const w = (Math.abs(r.diff) / mixMax) * 50;
                          const up = r.diff >= 0;
                          return (
                            <tr key={r.dept} className="row-hover">
                              <td data-label="진료과" className="td-dense whitespace-nowrap">{r.dept}</td>
                              <td data-label="차이" className="td-dense w-40">
                                <div className="relative h-3.5 w-full min-w-[120px]">
                                  <div className="absolute inset-y-0 left-1/2 w-px bg-gray-200 dark:bg-gray-700" />
                                  <div
                                    className="absolute inset-y-0.5 rounded-[2px]"
                                    style={{
                                      left: up ? "50%" : `${50 - w}%`,
                                      width: `${w}%`,
                                      backgroundColor: up ? chart.series[0] : chart.series[1],
                                    }}
                                  />
                                </div>
                              </td>
                              <td data-label="차이(%p)" className="td-dense fg-strong text-right font-medium">{signedPp(r.diff)}</td>
                              <td data-label="수도권" className="td-dense text-right">{r.metro_share.toFixed(1)}%</td>
                              <td data-label="비수도권" className="td-dense text-right">{r.non_metro_share.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="fg-muted mt-2 text-ui-sm">{deptMix?.summary}</p>
                  <p className="fg-subtle mt-2 text-ui-xs leading-relaxed">
                    각 비율은 해당 권역 내 의원급 신규 개설 중 차지하는 비중입니다. 수도권 의원{" "}
                    {(deptMix?.metro_total ?? 0).toLocaleString()}건 · 비수도권 의원{" "}
                    {(deptMix?.non_metro_total ?? 0).toLocaleString()}건 기준 · 진료과는 등록 진료과목이 아니라
                    기관명(간판)에서 파생한 값입니다.
                  </p>
                </>
              ) : (
                <EmptyState message="해당 기간 비교할 의원급 개설이 없습니다." />
              )}
            </Panel>
            )}
          </div>

          {category !== "hospitals" && (
          <Panel title="지역 × 진료과 개설 분포" desc={`${periodLabel} 의원`}>
            {heat && heat.sidos.length && heat.depts.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="table-dense min-w-[640px]">
                    <thead>
                      <tr>
                        <th className="th-dense th-sticky">지역＼진료과</th>
                        {heat.depts.map((d) => (
                          <th key={d} className="th-dense th-sticky text-right">
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {heat.sidos.map((s, r) => (
                        <tr key={s}>
                          <td className="td-dense fg-strong whitespace-nowrap font-medium">{s}</td>
                          {heat.depts.map((d, c) => {
                            const v = heat.cells[r][c];
                            const isTop = topCellKeys.has(`${r}-${c}`);
                            return (
                              <td
                                key={d}
                                className={`td-dense text-right ${v ? "fg-strong" : "fg-subtle"} ${
                                  isTop ? "font-semibold ring-2 ring-inset ring-gray-900/50 dark:ring-white/60" : ""
                                }`}
                                style={cellTint(v, heat.max, chart.series[0])}
                              >
                                {v ? v.toLocaleString() : "·"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="fg-muted mt-2 text-ui-sm">{heat.summary}</p>
                <p className="fg-subtle mt-2 text-ui-xs leading-relaxed">
                  {periodLabel} 의원 개설 · 테두리 강조는 상위 3개 셀. 색이 진할수록 건수가 많습니다.
                </p>
              </>
            ) : (
              <EmptyState message="해당 기간 의원급 개설이 없습니다." />
            )}
          </Panel>
          )}
        </>
      )}

      {!pending && (
        <Panel
          title="신규 개설 기관"
          desc={
            list
              ? `총 ${list.total.toLocaleString()}건 · ${
                  isOpenStatus ? "" : `${applied.status} 기준 · `
                }최대 ${PAGE_SIZE}건씩 표시 · 행을 누르면 주소와 지도 링크가 열립니다`
              : undefined
          }
        >
          {listLoading ? (
            <EmptyState message="조회 중입니다 (수 초 걸릴 수 있어요)" />
          ) : list && list.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="table-cards table-dense min-w-[680px]">
                  <thead>
                    <tr>
                      <th className="th-dense">사업장명</th>
                      <th className="th-dense">도로명주소</th>
                      <th className="th-dense">개설일</th>
                      <th className="th-dense">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((h) => (
                      <tr
                        key={h.id}
                        className="row-hover cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => setPicked(h)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          setPicked(h);
                        }}
                      >
                        <td data-label="사업장명" className="td-dense max-w-[240px]">
                          <div className="fg-strong truncate font-medium">{h.name}</div>
                          <div className="fg-subtle truncate text-ui-xs">
                            {[h.biz_type, category === "hospitals" ? null : h.dept].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
                        <td data-label="도로명주소" className="td-dense max-w-[360px]">
                          <div className="fg-muted truncate">{h.address || "주소 정보가 없습니다."}</div>
                        </td>
                        <td data-label="개설일" className="td-dense whitespace-nowrap tabular-nums">{h.opened_date || "—"}</td>
                        <td data-label="상태" className="td-dense whitespace-nowrap">
                          <span className="chip">
                            <span className={`dot ${STATUS_DOT[h.status]}`} />
                            {h.detail_status || h.status}
                          </span>
                          {!isOpenStatus && (
                            <div className="fg-subtle mt-0.5 text-ui-xs tabular-nums">
                              {list.date_label} {h.status_date || "—"}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} onChange={goPage} />
            </>
          ) : (
            <div className="empty-state">
              <p>조건에 맞는 결과가 없습니다</p>
              <p className="fg-subtle mt-1 text-ui-xs">
                {isOpenStatus
                  ? "기간을 늘리거나 지역·상태 조건을 바꿔보세요"
                  : "휴업·폐업은 휴업 시작일·폐업일 기준으로 조회합니다. 기간을 늘리거나 지역 조건을 바꿔보세요"}
              </p>
              <button type="button" className="btn btn-default mt-3" onClick={reset}>
                조건 초기화
              </button>
            </div>
          )}
        </Panel>
      )}

      <TermsFaq
        intro="행정안전부 지방행정 인허가(개설·등록) 데이터를 기반으로 전국 의료기관의 신규 개설 흐름을 지역·진료과·시기별로 정리해 보여 줍니다. 월별 개설 추이와 수도권·비수도권 구성, 지역 × 진료과 분포를 한 화면에서 확인하고, 관심 지역과 진료과의 개설 밀도를 비교할 수 있습니다."
        method="집계는 인허가일(개설일)을 기준으로 합니다. 최근 30일 신규 개설 건수를 최근 90일을 30일로 환산한 평균과 비교하고, 수도권(서울·경기·인천)과 비수도권 비중, 최근 12개월 월별 추이, 의원 대상 지역 × 진료과 분포를 함께 정리합니다. 진료과는 등록 진료과목이 아니라 기관명(간판)에서 파생하며, 문장·인사이트는 모두 규칙 기반으로 산출합니다. 모든 기간 창은 브라우저의 오늘이 아니라 데이터 기준일에 맞춰 잡습니다."
        terms={[
          {
            term: "신규 개설",
            desc: "인허가(개설·등록) 데이터에서 새로 등록된 건입니다. 실제 개원일이 아니라 등록 시점을 기준으로 셉니다.",
          },
          {
            term: "인허가일(개설일)",
            desc: "기관이 관할 지자체에 개설을 등록해 인허가된 날짜로, 이 화면 모든 집계의 기준 일자입니다.",
          },
          {
            term: "수도권 · 비수도권",
            desc: "수도권은 서울·경기·인천을 묶은 권역이며, 그 외 지역은 비수도권으로 구분합니다.",
          },
          {
            term: "30일 환산 평균",
            desc: "최근 90일 개설 건수를 30일 기준으로 환산(÷90×30)한 값으로, 최근 30일 실적과 비교하는 기준선입니다.",
          },
        ]}
        faqs={[
          {
            q: "'신규 병원' 탭에는 왜 진료과 관련 항목이 없나요?",
            a: "진료과는 기관명(간판)에서 파생한 값이라 '의원' 표기가 있는 의원급에만 신뢰할 수 있게 적용됩니다. 병원급은 종합병원·요양병원처럼 표기가 달라 같은 방식으로 분류하면 부정확해지므로, 병원 탭에서는 진료과 관련 차트·표기를 제공하지 않습니다.",
          },
          {
            q: "이번 달 수치가 지난달보다 작게 보이는 이유는 무엇인가요?",
            a: "이번 달 값은 데이터 기준일까지 누적된 '진행 중' 부분 집계라 월말로 갈수록 늘어납니다. 또 집계 기준이 인허가·등록일이어서 실제 진료 시작일과는 시차가 있을 수 있습니다.",
          },
          {
            q: "진료과 분포는 어떻게 정해지나요?",
            a: "지역 × 진료과 분포와 권역 비교는 의원만을 대상으로 하며, 진료과는 등록 진료과목이 아니라 기관명(간판)에서 파생한 값입니다. 실제 등록 진료과목과 다를 수 있어 대략적인 구분으로만 참고하시기 바랍니다.",
          },
          {
            q: "폐업이나 순증도 확인할 수 있나요?",
            a: "일부만 확인할 수 있습니다. 상태 필터로 휴업·폐업·취소/말소/정지를 조회할 수 있고 '개설 추이' 막대 아래쪽에 그 달의 폐업·휴업 수를 함께 그립니다. 다만 수집 범위 밖에서 개설된 기관의 폐업은 담기지 않으므로 순증(개설−폐업)은 산출하지 않습니다.",
          },
        ]}
      />

      {picked && <OpeningDetail item={picked} category={category} onClose={() => setPicked(null)} />}

      <p className="fg-subtle text-ui-xs leading-relaxed">
        출처: {meta?.source ?? "행정안전부 지방행정 인허가(개설·등록) 데이터"}
        {asOf ? ` · 기준일 ${asOf}` : ""} · 인허가 등록 기준이라 실제 개원일과 차이가 있을 수 있습니다 · 본
        개설현황은 재구성한 참고용 사실 정보이며, 특정 의료기관·지역에 대한 추천·순위·전망·평가나 의학적 판단이
        아닙니다.
      </p>
    </div>
  );
}

/**
 * 목록 행을 눌렀을 때 열리는 기관 상세 팝오버 (메디하루 3-9 `행 클릭 시 동작`).
 * 페이지 이동이 아니라 그 자리에서 열린다. 지도 미리보기는 좌표가 없어 넣지 않고,
 * 주소로 네이버 지도를 새 탭에 여는 링크와 주소 복사만 둔다.
 */
function OpeningDetail({
  item,
  category,
  onClose,
}: {
  item: OpeningItem;
  category: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const address = item.address || "";
  const mapHref = address
    ? `https://map.naver.com/p/search/${encodeURIComponent(address)}`
    : "";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied("주소를 복사했습니다.");
    } catch {
      setCopied("주소 복사에 실패했습니다.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 p-4 sm:items-center dark:bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} 상세`}
        className="surface-card w-full max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="card-title truncate">{item.name}</h3>
            <p className="fg-muted mt-0.5 text-ui-sm">
              {[item.biz_type, category === "hospitals" ? null : item.dept].filter(Boolean).join(" · ") || "분류 정보가 없습니다."}
            </p>
          </div>
          <button type="button" className="btn btn-default shrink-0" onClick={onClose}>
            닫기
          </button>
        </div>

        <dl className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="grid grid-cols-[72px_1fr] gap-3 py-2">
            <dt className="label-eyebrow">주소</dt>
            <dd className="fg-base text-ui-sm leading-relaxed">{address || "주소 정보가 없습니다."}</dd>
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-3 py-2">
            <dt className="label-eyebrow">개설일</dt>
            <dd className="fg-base text-ui-sm tabular-nums">{item.opened_date || "—"}</dd>
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-3 py-2">
            <dt className="label-eyebrow">상태</dt>
            <dd className="fg-base text-ui-sm">
              <span className="chip">
                <span className={`dot ${STATUS_DOT[item.status]}`} />
                {item.detail_status || item.status}
              </span>
            </dd>
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-3 py-2">
            <dt className="label-eyebrow">지역</dt>
            <dd className="fg-base text-ui-sm">
              {[item.sido, item.sigungu].filter(Boolean).join(" ") || "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mapHref ? (
            <a href={mapHref} target="_blank" rel="noreferrer" className="btn btn-primary">
              네이버 지도에서 보기
            </a>
          ) : (
            <span className="fg-subtle text-ui-xs">주소 정보가 없어 지도를 열 수 없습니다.</span>
          )}
          {address && (
            <button type="button" className="btn btn-default" onClick={copyAddress}>
              주소 복사
            </button>
          )}
        </div>
        {mapHref && (
          <p className="fg-subtle mt-1.5 text-ui-xs">
            새 탭에서 네이버 지도가 열립니다. 주소 위치를 확인할 수 있습니다.
          </p>
        )}
        {copied && (
          <p className="fg-muted mt-1.5 text-ui-xs" role="status">
            {copied}
          </p>
        )}
      </div>
    </div>
  );
}
