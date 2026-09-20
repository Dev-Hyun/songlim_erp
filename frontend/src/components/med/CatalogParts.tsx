"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ApexOptions } from "apexcharts";
import { CatalogDist, CatalogYear } from "./api";
import { EmptyState, Panel, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/** 경로 세그먼트에 한글 슬러그가 들어갈 수 있어 링크를 만들 때는 항상 인코딩한다. */
export const seg = (v: string) => encodeURIComponent(v);

export const categoryHref = (code: string) => `/med/equipment/categories/${seg(code)}`;
export const modelHref = (code: string, slug: string) =>
  `/med/equipment/categories/${seg(code)}/models/${seg(slug)}`;

/** 빵부스러기 — 클릭 탐색이 전부이므로 되돌아갈 경로를 항상 띄워 둔다. */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-ui-xs" aria-label="현재 위치">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="fg-subtle">/</span>}
          {it.href ? (
            <Link href={it.href} className="link-quiet">
              {it.label}
            </Link>
          ) : (
            <span className="fg-muted">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** 심평원 데이터의 성격을 매 화면 하단에 동일 문구로 고정한다. */
export function DataNote({ year, extra }: { year: number; extra?: string }) {
  return (
    <p className="fg-subtle text-ui-xs leading-relaxed">
      기준 시점: 심평원 의료장비 {year}년 스냅샷 · 수치는 해당 장비·모델을 <strong>등록한 것으로 확인된</strong>{" "}
      의료기관 수와 등록 대수이며, 실제 사용·설치·판매 대수나 시장점유율을 뜻하지 않습니다 · 모델명은 신고 표기를
      그대로 쓰므로 통용 명칭과 다를 수 있습니다.
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}

/**
 * 분포(종별/지역) — 가로 막대 + 같은 값을 그대로 담은 표.
 * 팔레트가 light 모드에서 대비 3:1 미만 슬롯을 갖고 있어(ui.tsx 주석 참고) 차트 옆에 표를 항상 둔다.
 * 계열이 하나라 범례는 두지 않고 제목이 계열명을 대신한다.
 */
export function DistPanel({
  title,
  desc,
  rows,
  unitLabel = "개 기관",
  keyHeader,
  chartKey,
  max = 12,
}: {
  title: string;
  desc?: string;
  rows: CatalogDist[];
  unitLabel?: string;
  keyHeader: string;
  chartKey: string;
  max?: number;
}) {
  const chart = useChartTheme();
  const top = rows.slice(0, max);
  const options: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "62%", borderRadiusApplication: "end" } },
    xaxis: {
      categories: top.map((r) => r.key),
      labels: { ...chart.axisLabel, formatter: (v: string) => Math.round(Number(v)).toLocaleString() },
      min: 0,
    },
    yaxis: { labels: chart.axisLabel },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}${unitLabel}` } },
  };

  return (
    <Panel title={title} desc={desc}>
      {top.length === 0 ? (
        <EmptyState message="데이터가 없습니다." />
      ) : (
        <>
          <ReactApexChart
            key={`${chartKey}-${chart.dark}`}
            options={options}
            series={[{ name: title, data: top.map((r) => r.hospitals) }]}
            type="bar"
            height={Math.max(220, top.length * 26)}
          />
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="table-dense">
              <thead>
                <tr>
                  <th className="th-dense th-sticky">{keyHeader}</th>
                  <th className="th-dense th-sticky text-right">보유 기관</th>
                  <th className="th-dense th-sticky text-right">등록 대수</th>
                  <th className="th-dense th-sticky text-right">비중</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.key} className="row-hover">
                    <td className="td-dense">{r.key}</td>
                    <td className="td-dense fg-strong text-right font-medium">{r.hospitals.toLocaleString()}</td>
                    <td className="td-dense text-right">{r.units.toLocaleString()}</td>
                    <td className="td-dense fg-muted text-right">{r.share.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * 연도별 확인 기관 수 — 세로 막대 + 표.
 * 2019~2024는 레거시 6분류(초음파/일반엑스선/CT/MRI/골밀도/C-arm)만 적재돼 있어서
 * 나머지 분류는 2025 한 해만 나온다. 그 경우 차트 대신 사유를 적는다.
 */
export function YearPanel({
  rows,
  multiYear,
  chartKey,
  desc,
}: {
  rows: CatalogYear[];
  multiYear: boolean;
  chartKey: string;
  desc?: string;
}) {
  const chart = useChartTheme();
  const options: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { borderRadius: 3, columnWidth: "55%", borderRadiusApplication: "end" } },
    xaxis: { categories: rows.map((r) => String(r.year)), labels: { ...chart.axisLabel, rotate: 0 } },
    yaxis: { labels: { ...chart.axisLabel, formatter: (v: number) => Math.round(v).toLocaleString() } },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}개 기관` } },
  };

  return (
    <Panel title="연도별 확인 기관 수" desc={desc}>
      {!multiYear ? (
        <p className="empty-state">
          이 분류는 {rows[0]?.year ?? "최신"}년 스냅샷에만 적재돼 있어 연도 비교를 할 수 없습니다.
          <br />
          <span className="fg-subtle text-ui-xs">
            연도별 이력은 초음파영상진단기·일반엑스선촬영장치·전산화단층촬영장치·자기공명영상진단기·골밀도검사기·C-Arm형
            엑스선장치 6개 분류에만 있습니다.
          </span>
        </p>
      ) : (
        <>
          <ReactApexChart
            key={`${chartKey}-${chart.dark}`}
            options={options}
            series={[{ name: "확인 기관 수", data: rows.map((r) => r.hospitals) }]}
            type="bar"
            height={240}
          />
          <div className="mt-2 overflow-x-auto">
            <table className="table-dense">
              <thead>
                <tr>
                  <th className="th-dense">연도</th>
                  <th className="th-dense text-right">확인 기관</th>
                  <th className="th-dense text-right">전년 대비</th>
                  <th className="th-dense text-right">등록 대수</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r, i) => {
                  const prev = i > 0 ? rows[i - 1].hospitals : null;
                  const delta = prev === null ? null : r.hospitals - prev;
                  return (
                    <tr key={r.year} className="row-hover">
                      <td className="td-dense">{r.year}</td>
                      <td className="td-dense fg-strong text-right font-medium">{r.hospitals.toLocaleString()}</td>
                      <td className="td-dense fg-muted text-right">
                        {delta === null ? "—" : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()}`}
                      </td>
                      <td className="td-dense text-right">{r.units.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="fg-subtle mt-2 text-ui-xs">
            등록 기관 수의 증감이며 신규 구매·판매량을 뜻하지 않습니다.
          </p>
        </>
      )}
    </Panel>
  );
}
