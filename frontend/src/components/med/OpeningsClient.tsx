"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { useEffect, useState } from "react";
import {
  MedMeta,
  NewHospital,
  OpeningsPeriod,
  OpeningsSummary,
  OpeningsTrend,
  Paged,
  RegionOpenings,
  fetchMedMeta,
  fetchMedSigungu,
  fetchNewHospitals,
  fetchOpeningsByRegion,
  fetchOpeningsSummary,
  fetchOpeningsTrend,
} from "./api";
import { EmptyState, Pagination, Panel, StatTile, selectClass, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const PAGE_SIZE = 20;

// 심평원 개설일자 신고 지연(최근 4~5개월) 때문에 짧은 구간은 과소 집계된다 — 그 구간에만 경고를 띄운다.
const SHORT_PERIODS = new Set<OpeningsPeriod>(["7d", "30d", "90d"]);

const PERIODS: { value: OpeningsPeriod; label: string }[] = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "90d", label: "90일" },
  { value: "1y", label: "1년" },
  { value: "3y", label: "3년" },
  { value: "5y", label: "5년" },
  { value: "all", label: "전체" },
];

const GRAN_LABEL = { day: "일별", month: "월별", year: "연별" } as const;

/** 서버가 준 버킷 문자열을 축 라벨로. Date로 파싱하지 않으므로 시간대 영향이 없다. */
function bucketLabel(bucket: string, gran: OpeningsTrend["granularity"]): string {
  if (gran === "day") return `${Number(bucket.slice(5, 7))}/${Number(bucket.slice(8, 10))}`;
  if (gran === "month") return `${bucket.slice(2, 4)}.${bucket.slice(5, 7)}`;
  return bucket;
}

function rangeText(start: string | null, end: string): string {
  return start ? `${start} ~ ${end}` : `전체 기간 ~ ${end}`;
}

export default function OpeningsClient() {
  const chart = useChartTheme();
  const [meta, setMeta] = useState<MedMeta | null>(null);
  const [sigunguList, setSigunguList] = useState<string[]>([]);

  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [typeGroup, setTypeGroup] = useState("");
  const [period, setPeriod] = useState<OpeningsPeriod>("1y");

  const [summary, setSummary] = useState<OpeningsSummary | null>(null);
  const [trend, setTrend] = useState<OpeningsTrend | null>(null);
  const [byRegion, setByRegion] = useState<RegionOpenings | null>(null);
  const [list, setList] = useState<Paged<NewHospital> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;

  useEffect(() => {
    fetchMedMeta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setSigungu("");
    if (!sido) {
      setSigunguList([]);
      return;
    }
    fetchMedSigungu(sido).then(setSigunguList).catch(() => setSigunguList([]));
  }, [sido]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchOpeningsSummary({ period, sido, sigungu, type_group: typeGroup }),
      fetchOpeningsTrend({ period, sido, sigungu, type_group: typeGroup }),
    ])
      .then(([s, t]) => {
        setSummary(s);
        setTrend(t);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period, sido, sigungu, typeGroup]);

  useEffect(() => {
    fetchOpeningsByRegion({ period, sido, type_group: typeGroup })
      .then(setByRegion)
      .catch(() => setByRegion(null));
  }, [period, sido, typeGroup]);

  useEffect(() => {
    setPage(1);
    fetchNewHospitals({ period, sido, sigungu, type_group: typeGroup, page: 1, page_size: PAGE_SIZE })
      .then(setList)
      .catch(() => setList(null));
  }, [period, sido, sigungu, typeGroup]);

  function goPage(p: number) {
    setPage(p);
    fetchNewHospitals({ period, sido, sigungu, type_group: typeGroup, page: p, page_size: PAGE_SIZE })
      .then(setList)
      .catch(() => setList(null));
  }

  const points = trend?.points || [];
  const gran = trend?.granularity || "month";
  const trendOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { borderRadius: 3, columnWidth: "60%", borderRadiusApplication: "end" } },
    xaxis: {
      categories: points.map((p) => bucketLabel(p.bucket, gran)),
      labels: { ...chart.axisLabel, hideOverlappingLabels: true, rotate: 0 },
      tickPlacement: "on",
    },
    yaxis: { labels: { ...chart.axisLabel, formatter: (v: number) => Math.round(v).toLocaleString() } },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}개소` } },
  };

  const regionTop = (byRegion?.rows || []).slice(0, 17);
  const regionOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "62%" } },
    xaxis: {
      categories: regionTop.map((r) => r.region),
      labels: { ...chart.axisLabel, formatter: (v: string) => Math.round(Number(v)).toLocaleString() },
      min: 0,
    },
    yaxis: { labels: chart.axisLabel },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}개소` } },
  };

  return (
    <div className="space-y-6">
      <Panel title="필터">
        <div className="flex flex-wrap items-center gap-2">
          <select value={sido} onChange={(e) => setSido(e.target.value)} className={selectClass}>
            <option value="">전국</option>
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
          <div className="seg" role="group" aria-label="개설 기간">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={`seg-item ${period === p.value ? "seg-item-on" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {summary && (
          <p className="fg-subtle mt-3 text-ui-xs">
            심평원 병원정보서비스 <strong>개설일자</strong> 기준 집계 ({rangeText(summary.start, summary.end)}). 개설일자가
            없는 {summary.missing_estb_date.toLocaleString()}개 기관은 집계에서 제외됩니다
            {summary.latest_estb_date ? ` · 데이터상 최신 개설일 ${summary.latest_estb_date}` : ""} · 폐업·휴업 일자는
            원천 데이터에 없어 제공하지 않습니다.
          </p>
        )}
        {summary && SHORT_PERIODS.has(period) && (
          <p className="mt-2 rounded-control border border-warning-300 bg-warning-50 px-3 py-2 text-ui-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
            <strong>최근 구간은 실제보다 적게 나옵니다.</strong> 심평원 개설일자 신고에 수개월 지연이 있어,
            최근 4~5개월은 아직 집계가 덜 반영된 상태입니다(직전 정상 수준은 월 200건 안팎).
            추세 비교에는 <strong>1년 이상</strong> 구간을 쓰시는 편이 정확합니다.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </Panel>

      {loading && <EmptyState message="불러오는 중..." />}

      {!loading && summary && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              label={`최근 ${periodLabel} 신규 개설`}
              value={summary.opened}
              sub={
                summary.delta === null ? (
                  rangeText(summary.start, summary.end)
                ) : (
                  <span className={summary.delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {summary.delta >= 0 ? "▲" : "▼"} {Math.abs(summary.delta).toLocaleString()} vs 직전 동일 기간
                  </span>
                )
              }
            />
            <StatTile
              label="직전 동일 기간"
              value={summary.opened_prev ?? "—"}
              sub={summary.prev_start ? `${summary.prev_start} ~ ${summary.prev_end}` : "전체 기간 조회에는 없음"}
            />
            <StatTile label="전체 등록 의료기관" value={summary.total_hospitals} sub="DB 기준" />
            <StatTile
              label="개설일자 보유"
              value={summary.with_estb_date}
              sub={`전체의 ${((summary.with_estb_date / (summary.total_hospitals || 1)) * 100).toFixed(1)}%`}
            />
            <StatTile label="폐업 · 휴업" value="데이터 없음" sub="심평원 병원정보서비스 미제공" />
          </div>

          <Panel
            title={`${GRAN_LABEL[gran]} 신규 개설 추이`}
            desc={trend ? `${trend.start} ~ ${trend.end} · 개설일자 기준` : undefined}
          >
            {points.length ? (
              <ReactApexChart
                key={`trend-${period}-${sido}-${sigungu}-${typeGroup}-${chart.dark}`}
                options={trendOptions}
                series={[{ name: "신규 개설", data: points.map((p) => p.count) }]}
                type="bar"
                height={280}
              />
            ) : (
              <EmptyState message="데이터가 없습니다." />
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel
              title={`${byRegion?.level === "sigungu" ? "시군구" : "시도"}별 신규 개설`}
              desc={sido ? `${sido} 내 시군구` : "시도를 고르면 시군구 단위로 내려갑니다"}
            >
              {regionTop.length ? (
                <ReactApexChart
                  key={`region-${period}-${sido}-${typeGroup}-${chart.dark}`}
                  options={regionOptions}
                  series={[{ name: "신규 개설", data: regionTop.map((r) => r.opened) }]}
                  type="bar"
                  height={Math.max(280, regionTop.length * 26)}
                />
              ) : (
                <EmptyState message="데이터가 없습니다." />
              )}
            </Panel>

            <Panel title="지역별 표" desc="전체 기관 수 대비 신규 개설 비율">
              <div className="max-h-[420px] overflow-auto">
                <table className="table-dense">
                  <thead>
                    <tr>
                      <th className="th-dense th-sticky">지역</th>
                      <th className="th-dense th-sticky text-right">전체 기관</th>
                      <th className="th-dense th-sticky text-right">최근 {periodLabel} 개설</th>
                      <th className="th-dense th-sticky text-right">비율</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {(byRegion?.rows || []).map((r) => (
                      <tr key={r.region} className="row-hover">
                        <td className="td-dense">{r.region}</td>
                        <td className="td-dense text-right">{r.total.toLocaleString()}</td>
                        <td className="td-dense fg-strong text-right font-semibold">
                          {r.opened.toLocaleString()}
                        </td>
                        <td className="td-dense fg-muted text-right">
                          {r.total ? ((r.opened / r.total) * 100).toFixed(2) : "0.00"}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title={`최근 ${periodLabel} 신규 개설 의료기관`} desc="개설일자 최신순">
            {list && list.items.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="table-dense min-w-[680px]">
                    <thead>
                      <tr>
                        <th className="th-dense">개설일자</th>
                        <th className="th-dense">의료기관</th>
                        <th className="th-dense">종별</th>
                        <th className="th-dense">지역</th>
                        <th className="th-dense">주소</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.items.map((h) => (
                        <tr key={h.hospital_id} className="row-hover">
                          <td className="td-dense whitespace-nowrap tabular-nums">{h.estb_date || "-"}</td>
                          <td className="td-dense max-w-[220px]">
                            <div className="fg-strong truncate font-medium">{h.name}</div>
                          </td>
                          <td className="td-dense whitespace-nowrap">{h.type || "-"}</td>
                          <td className="td-dense whitespace-nowrap">
                            {[h.sido, h.sigungu].filter(Boolean).join(" ") || "-"}
                          </td>
                          <td className="td-dense max-w-[300px]">
                            <div className="fg-muted truncate">{h.address || "주소 없음"}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} onChange={goPage} />
              </>
            ) : (
              <EmptyState message="해당 조건의 신규 개설 기관이 없습니다." />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
