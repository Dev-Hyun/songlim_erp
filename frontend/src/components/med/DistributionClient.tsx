"use client";

import Script from "next/script";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { useEffect, useRef, useState } from "react";
import {
  DistributionRegion,
  HospitalRow,
  MedMeta,
  Paged,
  fetchDistributionHospitals,
  fetchDistributionRegions,
  fetchDistributionTypes,
  fetchMedMeta,
} from "./api";
import { EmptyState, Pagination, Panel, StatTile, inputClass, selectClass, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || "";
const DEFAULT_CENTER = { lat: 36.35, lng: 127.85 };
const PAGE_SIZE = 20;
type Metric = "hospitals" | "units" | "eq_share" | "units_per_100";

const METRICS: { value: Metric; label: string; suffix: string }[] = [
  { value: "hospitals", label: "의료기관 수", suffix: "개소" },
  { value: "units", label: "장비 대수", suffix: "대" },
  { value: "eq_share", label: "장비 보유 기관 비율", suffix: "%" },
  { value: "units_per_100", label: "기관 100개소당 장비", suffix: "대" },
];

export default function DistributionClient() {
  const chart = useChartTheme();
  const [meta, setMeta] = useState<MedMeta | null>(null);
  const [sido, setSido] = useState("");
  const [typeGroup, setTypeGroup] = useState("");
  const [category, setCategory] = useState("");
  // ""는 "서버 기본(최신 스냅샷)" — meta 응답으로 year를 되돌려 넣지 않아야
  // 아래 집계 effect가 다른 effect의 setState 때문에 다시 도는 연쇄 렌더가 생기지 않는다.
  const [year, setYear] = useState<number | "">("");
  const [dataYear, setDataYear] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("hospitals");

  const [regions, setRegions] = useState<DistributionRegion[]>([]);
  const [level, setLevel] = useState<"sido" | "sigungu">("sido");
  const [types, setTypes] = useState<{ total: number; rows: { type: string; count: number; share: number }[] } | null>(
    null
  );
  const [selected, setSelected] = useState<string>("");
  const [listQ, setListQ] = useState("");
  const [list, setList] = useState<Paged<HospitalRow> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMedMeta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    // 필터가 바뀔 때 로딩 플래그를 켜는 건 이 저장소의 기존 조회 화면과 같은 방식이다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    Promise.all([
      fetchDistributionRegions({ sido, type_group: typeGroup, category, year: year || undefined }),
      fetchDistributionTypes({ sido }),
    ])
      .then(([r, t]) => {
        setRegions(r.rows);
        setLevel(r.level);
        setDataYear(r.year);
        setTypes(t);
        setSelected("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sido, typeGroup, category, year]);

  useEffect(() => {
    if (!sido && !selected) return;
    fetchDistributionHospitals({
      sido: sido || selected,
      sigungu: sido ? selected : "",
      type_group: typeGroup,
      q: listQ,
      page: 1,
      page_size: PAGE_SIZE,
    })
      .then((r) => {
        setPage(1);
        setList(r);
      })
      .catch(() => setList(null));
  }, [sido, selected, typeGroup, listQ]);

  function goPage(p: number) {
    setPage(p);
    fetchDistributionHospitals({
      sido: sido || selected,
      sigungu: sido ? selected : "",
      type_group: typeGroup,
      q: listQ,
      page: p,
      page_size: PAGE_SIZE,
    })
      .then(setList)
      .catch(() => setList(null));
  }

  const metricDef = METRICS.find((m) => m.value === metric) ?? METRICS[0];
  const regionPicked = Boolean(sido || selected);
  const shownList = regionPicked ? list : null;
  const sorted = [...regions].sort((a, b) => b[metric] - a[metric]);
  const totalHospitals = regions.reduce((s, r) => s + r.hospitals, 0);
  const totalUnits = regions.reduce((s, r) => s + r.units, 0);
  const totalEqHospitals = regions.reduce((s, r) => s + r.eq_hospitals, 0);

  const barOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "62%" } },
    xaxis: {
      categories: sorted.map((r) => r.region),
      min: 0,
      labels: { ...chart.axisLabel, formatter: (v: string) => Number(v).toLocaleString() },
    },
    yaxis: { labels: chart.axisLabel },
    tooltip: {
      ...chart.base.tooltip,
      y: { formatter: (v: number) => `${v.toLocaleString()}${metricDef.suffix}` },
    },
  };

  // 종별 분포는 상위 5종 + 기타 — 팔레트가 5슬롯까지만 검증되어 있어서 6번째는 회색 '기타'로 접는다
  const topTypes = (types?.rows || []).slice(0, 5);
  const otherCount = (types?.rows || []).slice(5).reduce((s, t) => s + t.count, 0);
  const donutLabels = [...topTypes.map((t) => t.type), ...(otherCount ? ["기타"] : [])];
  const donutSeries = [...topTypes.map((t) => t.count), ...(otherCount ? [otherCount] : [])];
  const donutOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "donut" },
    colors: [...chart.series.slice(0, topTypes.length), chart.dark ? "#6b7280" : "#9ca3af"],
    labels: donutLabels,
    legend: { ...chart.base.legend, position: "bottom" },
    stroke: { width: 2, colors: [chart.dark ? "#111827" : "#ffffff"] },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}개소` } },
  };

  return (
    <div className="space-y-6">
      <Panel title="필터">
        <div className="flex flex-wrap items-center gap-2">
          <select value={sido} onChange={(e) => setSido(e.target.value)} className={selectClass}>
            <option value="">전국 (시도별)</option>
            {(meta?.sidos || []).map((s) => (
              <option key={s} value={s}>
                {s} (시군구별)
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
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
            <option value="">전체 장비 분류</option>
            {(meta?.categories || []).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
            className={selectClass}
          >
            <option value="">최신 장비 기준</option>
            {(meta?.years || []).map((y) => (
              <option key={y} value={y}>
                {y}년 장비 기준
              </option>
            ))}
          </select>
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className={selectClass}>
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <p className="fg-muted mt-3 text-ui-xs">
          지도 원의 크기는 선택한 지표의 상대 크기이며, 특정 지역에 대한 판단이 아닙니다.
        </p>
      </Panel>

      {loading && <EmptyState message="불러오는 중..." />}

      {!loading && regions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="의료기관 수" value={totalHospitals} sub={sido || "전국"} />
            <StatTile
              label="장비 보유 기관"
              value={totalEqHospitals}
              sub={`${totalHospitals ? ((totalEqHospitals / totalHospitals) * 100).toFixed(1) : "0.0"}%`}
            />
            <StatTile label="장비 대수" value={totalUnits} sub={`${dataYear ?? "-"}년 신고 기준`} />
            <StatTile label={level === "sido" ? "시도 수" : "시군구 수"} value={regions.length} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <Panel
              title="지역 분포 지도"
              desc="원의 크기 = 선택한 지표. 원을 누르면 아래 목록이 해당 지역으로 바뀝니다."
              className="xl:col-span-3"
            >
              <BubbleMap regions={sorted} metric={metric} suffix={metricDef.suffix} onSelect={setSelected} />
            </Panel>

            <Panel title="종별 구성" desc={sido || "전국"} className="xl:col-span-2">
              {donutSeries.length ? (
                <>
                  <ReactApexChart
                    key={`donut-${sido}-${chart.dark}`}
                    options={donutOptions}
                    series={donutSeries}
                    type="donut"
                    height={260}
                  />
                  <table className="mt-3 w-full text-sm">
                    <tbody className="tabular-nums">
                      {(types?.rows || []).map((t) => (
                        <tr key={t.type} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                          <td className="py-1.5 text-gray-700 dark:text-gray-300">{t.type}</td>
                          <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">
                            {t.count.toLocaleString()}
                          </td>
                          <td className="w-14 py-1.5 text-right text-gray-500 dark:text-gray-400">{t.share}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <EmptyState message="데이터가 없습니다." />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title={`${level === "sido" ? "시도" : "시군구"}별 ${metricDef.label}`}>
              <ReactApexChart
                key={`bar-${sido}-${metric}-${category}-${dataYear}-${chart.dark}`}
                options={barOptions}
                series={[{ name: metricDef.label, data: sorted.map((r) => r[metric]) }]}
                type="bar"
                height={Math.max(300, sorted.length * 24)}
              />
            </Panel>

            <Panel title="지역별 표" desc="행을 누르면 아래 의료기관 목록이 바뀝니다.">
              <div className="max-h-[520px] overflow-auto">
                <table className="table-cards w-full text-sm">
                  <thead className="sticky top-0 bg-white text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="py-2 text-left font-medium">지역</th>
                      <th className="py-2 text-right font-medium">기관 수</th>
                      <th className="py-2 text-right font-medium">장비 보유</th>
                      <th className="py-2 text-right font-medium">보유율</th>
                      <th className="py-2 text-right font-medium">장비 대수</th>
                      <th className="py-2 text-right font-medium">100개소당</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {sorted.map((r) => (
                      <tr
                        key={r.region}
                        onClick={() => setSelected(r.region === selected ? "" : r.region)}
                        className={`cursor-pointer border-b border-gray-100 dark:border-gray-800 ${
                          selected === r.region
                            ? "bg-brand-50 dark:bg-brand-500/10"
                            : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <td data-label="지역" className="py-2 text-gray-800 dark:text-gray-200">{r.region}</td>
                        <td data-label="기관 수" className="py-2 text-right text-gray-700 dark:text-gray-300">
                          {r.hospitals.toLocaleString()}
                        </td>
                        <td data-label="장비 보유" className="py-2 text-right text-gray-700 dark:text-gray-300">
                          {r.eq_hospitals.toLocaleString()}
                        </td>
                        <td data-label="보유율" className="py-2 text-right text-gray-500 dark:text-gray-400">{r.eq_share}%</td>
                        <td data-label="장비 대수" className="py-2 text-right text-gray-700 dark:text-gray-300">
                          {r.units.toLocaleString()}
                        </td>
                        <td data-label="100개소당" className="py-2 text-right text-gray-500 dark:text-gray-400">{r.units_per_100}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel
            title="의료기관 목록"
            desc={
              sido || selected
                ? `${sido || selected}${sido && selected ? ` ${selected}` : ""}`
                : "위 표나 지도에서 지역을 선택하세요."
            }
            right={
              <input
                value={listQ}
                onChange={(e) => setListQ(e.target.value)}
                placeholder="기관명 검색"
                className={`${inputClass} w-44`}
              />
            }
          >
            {shownList && shownList.items.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="table-cards w-full min-w-[560px] text-sm">
                    <thead className="text-xs text-gray-500 dark:text-gray-400">
                      <tr className="border-b border-gray-200 dark:border-gray-800">
                        <th className="py-2 text-left font-medium">의료기관</th>
                        <th className="py-2 text-left font-medium">종별</th>
                        <th className="py-2 text-left font-medium">지역</th>
                        <th className="py-2 text-left font-medium">주소</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownList.items.map((h) => (
                        <tr key={h.hospital_id} className="border-b border-gray-100 dark:border-gray-800">
                          <td data-label="의료기관" className="max-w-[220px] py-2.5 pr-3">
                            <div className="truncate font-medium text-gray-800 dark:text-gray-100">{h.name}</div>
                          </td>
                          <td data-label="종별" className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{h.type || "-"}</td>
                          <td data-label="지역" className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">
                            {h.sido} {h.sigungu}
                          </td>
                          <td data-label="주소" className="max-w-[300px] py-2.5">
                            <div className="truncate text-gray-500 dark:text-gray-400">{h.address || "-"}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={shownList.total} onChange={goPage} />
              </>
            ) : (
              <EmptyState message="지역을 선택하면 의료기관 목록이 표시됩니다." />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * 네이버 지도 버블맵 — sales-map과 같은 방식으로 SDK를 로드하되, 마커 대신
 * 지역 중심좌표에 원(Circle)을 그려 지표 크기를 나타낸다. 지역 단위 집계(최대 시군구 수십 개)만
 * 그리므로 64K 병원 마커를 올리는 일은 없다.
 */
function BubbleMap({
  regions,
  metric,
  suffix,
  onSelect,
}: {
  regions: DistributionRegion[];
  metric: Metric;
  suffix: string;
  onSelect: (region: string) => void;
}) {
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && !!window.naver?.maps
  );
  const [scriptError, setScriptError] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);
  // 네이버 지도 SDK는 공식 타입이 없어 이 컴포넌트가 실제로 호출하는 메서드만 선언한다
  const mapRef = useRef<{ fitBounds: (bounds: unknown) => void } | null>(null);
  const overlaysRef = useRef<{ setMap: (map: unknown) => void }[]>([]);

  useEffect(() => {
    if (!scriptLoaded || mapRef.current || !divRef.current) return;
    const naver = window.naver;
    if (!naver?.maps) return;
    mapRef.current = new naver.maps.Map(divRef.current, {
      center: new naver.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      zoom: 7,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT },
    });
  }, [scriptLoaded]);

  useEffect(() => {
    const naver = window.naver;
    if (!scriptLoaded || !naver?.maps || !mapRef.current) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const withCoords = regions.filter((r) => r.lat != null && r.lng != null && r[metric] > 0);
    if (!withCoords.length) return;
    const max = Math.max(...withCoords.map((r) => r[metric]));
    const bounds = new naver.maps.LatLngBounds();

    withCoords.forEach((r) => {
      const pos = new naver.maps.LatLng(r.lat as number, r.lng as number);
      bounds.extend(pos);
      // 면적이 값에 비례하도록 반지름은 sqrt 스케일 (지름 비례는 큰 값을 과장한다)
      const radius = 6000 + 46000 * Math.sqrt(r[metric] / max);
      const circle = new naver.maps.Circle({
        map: mapRef.current,
        center: pos,
        radius,
        fillColor: "#465fff",
        fillOpacity: 0.28,
        strokeColor: "#465fff",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        clickable: true,
      });
      naver.maps.Event.addListener(circle, "click", () => onSelect(r.region));
      overlaysRef.current.push(circle);

      const label = new naver.maps.Marker({
        map: mapRef.current,
        position: pos,
        icon: {
          content: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:600 11px/1.2 Outfit,sans-serif;color:#0b0b0b;background:rgba(255,255,255,.88);border-radius:6px;padding:2px 5px;box-shadow:0 1px 3px rgba(0,0,0,.2)">${r.region}<br/><span style="font-weight:700">${r[metric].toLocaleString()}${suffix}</span></div>`,
        },
        clickable: true,
      });
      naver.maps.Event.addListener(label, "click", () => onSelect(r.region));
      overlaysRef.current.push(label);
    });
    mapRef.current.fitBounds(bounds);
  }, [regions, metric, suffix, scriptLoaded, onSelect]);

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_CLIENT_ID}`}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setScriptError(true)}
      />
      <div ref={divRef} className="h-[460px] w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
      {scriptError && (
        <p className="mt-2 text-xs text-red-500">지도를 불러오지 못했습니다. 아래 표와 차트로 확인해 주세요.</p>
      )}
    </>
  );
}
