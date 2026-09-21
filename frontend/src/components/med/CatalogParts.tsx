"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ApexOptions } from "apexcharts";
import { useState } from "react";
import { CatalogDist, CatalogYear } from "./api";
import { EmptyState, Panel, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/** 경로 세그먼트에 한글 슬러그가 들어갈 수 있어 링크를 만들 때는 항상 인코딩한다. */
export const seg = (v: string) => encodeURIComponent(v);

export const categoryHref = (code: string) => `/med/equipment/categories/${seg(code)}`;
export const modelHref = (code: string, slug: string) =>
  `/med/equipment/categories/${seg(code)}/models/${seg(slug)}`;
/** 모델명만으로 들어오는 입구 — 분류가 여럿이면 선택 페이지가 받는다. */
export const modelNameHref = (nameSlug: string) => `/med/equipment/models/${seg(nameSlug)}`;
export const hospitalHref = (id: number) => `/med/hospitals/${id}`;
/**
 * 분류·모델 상세 → 고급 검색 딥링크.
 * 분류/모델 상세는 읽기 전용이고, 지역·종별로 좁히는 일은 장비 검색 화면이 맡는다.
 */
export const equipmentSearchHref = (category: string, model?: string) =>
  `/med/equipment-search?mode=advanced&eq=${seg(category)}${model ? `&model=${seg(model)}` : ""}`;

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

/**
 * `나머지 N개 보기 ▾` / `접기 ▴` — 목록·분포를 처음에 몇 줄만 보여주고 나머지를 펼치는 버튼.
 * 화면마다 라벨이 갈리지 않게 한 곳에 둔다.
 */
export function MoreToggle({
  open,
  rest,
  unit = "개",
  onToggle,
}: {
  open: boolean;
  rest: number;
  unit?: string;
  onToggle: () => void;
}) {
  if (rest <= 0) return null;
  return (
    <button type="button" className="btn btn-default mt-2" onClick={onToggle} aria-expanded={open}>
      {open ? "접기 ▴" : `나머지 ${rest.toLocaleString()}${unit} 보기 ▾`}
    </button>
  );
}

/**
 * 상세 화면 하단 CTA — 여기서는 필터링하지 않고 장비 검색으로 넘긴다.
 * 카드 전체가 링크다(부분 링크가 아니다).
 */
export function SearchCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="surface-card flex items-center gap-3 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
    >
      <span className="min-w-0 flex-1">
        <span className="fg-strong block text-ui-md font-semibold">{label}</span>
        <span className="fg-muted mt-0.5 block text-ui-sm">지역·의료기관 종별로 좁혀 볼 수 있습니다</span>
      </span>
      <span className="fg-subtle shrink-0" aria-hidden>
        →
      </span>
    </Link>
  );
}

/**
 * `데이터 안내` — 심평원 데이터의 성격을 매 화면 하단에 같은 불릿으로 고정한다.
 * 메디하루는 연 1회 공개되는 12월 스냅샷을 쓰고 우리는 연도 스냅샷을 쓰므로 문구는 우리 사실로 적는다.
 */
export function DataNote({ year, extra }: { year: number; extra?: string }) {
  return (
    <Panel title="데이터 안내">
      <ul className="fg-muted list-disc space-y-1.5 pl-5 text-ui-sm leading-relaxed">
        <li>기준 시점: 건강보험심사평가원 의료장비 {year}년 스냅샷.</li>
        <li>
          수치는 해당 장비·모델을 보유·등록한 것으로 <b className="fg-base">확인된</b> 의료기관 수와 등록
          대수이며, 실제 사용·설치·판매·구매 대수나 시장점유율을 뜻하지 않습니다.
        </li>
        <li>모델명은 의료장비 허가증 기재 형태(심평원 신고 표기)라 실제 통용 명칭과 다를 수 있습니다.</li>
        <li>연 1회 갱신되는 공개 데이터 기준이므로, 최신 현황과 차이가 있을 수 있습니다.</li>
        {extra && <li>{extra}</li>}
      </ul>
    </Panel>
  );
}

/**
 * 안내 · 용어 · 자주 묻는 질문 — 메디하루 2-9 / 3-10 의 하단 블록.
 * 문답은 화면마다 다르므로 내용은 호출부가 넘긴다.
 */
export function TermsFaq({
  intro,
  method,
  terms,
  faqs,
}: {
  intro: string;
  method: string;
  terms: { term: string; desc: string }[];
  faqs: { q: string; a: string }[];
}) {
  return (
    <Panel title="집계 방법 · 용어 · 자주 묻는 질문">
      <p className="fg-base text-ui-sm leading-relaxed">{intro}</p>

      <h4 className="fg-strong mt-4 text-ui-md font-semibold">집계 방법</h4>
      <p className="fg-muted mt-1 text-ui-sm leading-relaxed">{method}</p>

      <h4 className="fg-strong mt-4 text-ui-md font-semibold">용어 안내</h4>
      <dl className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
        {terms.map((t) => (
          <div key={t.term} className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[160px_1fr] sm:gap-3">
            <dt className="fg-strong text-ui-sm font-medium">{t.term}</dt>
            <dd className="fg-muted text-ui-sm leading-relaxed">{t.desc}</dd>
          </div>
        ))}
      </dl>

      <h4 className="fg-strong mt-4 text-ui-md font-semibold">자주 묻는 질문</h4>
      <div className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
        {faqs.map((f) => (
          <details key={f.q} className="group py-2">
            <summary className="fg-base flex cursor-pointer list-none items-center gap-2 text-ui-sm font-medium">
              <span className="fg-subtle text-ui-xs group-open:hidden" aria-hidden>
                ▸
              </span>
              <span className="fg-subtle hidden text-ui-xs group-open:inline" aria-hidden>
                ▾
              </span>
              <span className="min-w-0">{f.q}</span>
            </summary>
            <p className="fg-muted mt-1.5 pl-5 text-ui-sm leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </Panel>
  );
}

/**
 * 분포(종별/지역) — 가로 막대 + 같은 값을 그대로 담은 표.
 * 팔레트가 light 모드에서 대비 3:1 미만 슬롯을 갖고 있어(ui.tsx 주석 참고) 차트 옆에 표를 항상 둔다.
 * 계열이 하나라 범례는 두지 않고 제목이 계열명을 대신한다.
 * 스크롤 상자 대신 `나머지 N개 보기 ▾` 로 펼친다 — 접힌 채로 스크롤이 생기면 나머지가 있는 줄 모른다.
 */
export function DistPanel({
  title,
  desc,
  rows,
  unitLabel = "개 기관",
  keyHeader,
  chartKey,
  max = 6,
}: {
  title: string;
  desc?: string;
  rows: CatalogDist[];
  unitLabel?: string;
  keyHeader: string;
  chartKey: string;
  /** 처음에 보여줄 줄 수. 나머지는 버튼으로 펼친다. */
  max?: number;
}) {
  const chart = useChartTheme();
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, max);
  const options: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "62%", borderRadiusApplication: "end" } },
    xaxis: {
      categories: shown.map((r) => r.key),
      labels: { ...chart.axisLabel, formatter: (v: string) => Math.round(Number(v)).toLocaleString() },
      min: 0,
    },
    yaxis: { labels: chart.axisLabel },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}${unitLabel}` } },
  };

  return (
    <Panel title={title} desc={desc}>
      {shown.length === 0 ? (
        <EmptyState message="데이터가 없습니다." />
      ) : (
        <>
          <ReactApexChart
            key={`${chartKey}-${chart.dark}-${open}`}
            options={options}
            series={[{ name: title, data: shown.map((r) => r.hospitals) }]}
            type="bar"
            height={Math.max(220, shown.length * 26)}
          />
          <div className="mt-2 overflow-x-auto">
            <table className="table-cards table-dense">
              <thead>
                <tr>
                  <th className="th-dense">{keyHeader}</th>
                  <th className="th-dense text-right">확인 의료기관</th>
                  <th className="th-dense text-right">등록 대수</th>
                  <th className="th-dense text-right">비중</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {shown.map((r) => (
                  <tr key={r.key} className="row-hover">
                    <td data-label="항목" className="td-dense">{r.key}</td>
                    <td data-label="확인 의료기관" className="td-dense fg-strong text-right font-medium">{r.hospitals.toLocaleString()}</td>
                    <td data-label="등록 대수" className="td-dense text-right">{r.units.toLocaleString()}</td>
                    <td data-label="비중" className="td-dense fg-muted text-right">{r.share.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MoreToggle open={open} rest={rows.length - max} onToggle={() => setOpen((v) => !v)} />
        </>
      )}
    </Panel>
  );
}

/**
 * 최근 연도별 확인 기관 수 — 세로 막대 + 표 + 첫해→끝해 요약줄.
 * 2019~2022는 레거시 6분류(초음파/일반엑스선/CT/MRI/골밀도/C-arm)만 적재돼 있어서
 * 나머지 분류는 최신 한 해만 나온다. 그 경우 차트 대신 사유를 적는다.
 *
 * 막대의 Y축은 0에서 시작한다. 메디하루는 축을 잘라 쓰지만(6,000~6,600), 잘린 축은 증감 폭을
 * 실제보다 크게 보이게 하므로 따라가지 않는다 — 대신 요약줄에 증감과 증감률을 숫자로 적는다.
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
    yaxis: { labels: { ...chart.axisLabel, formatter: (v: number) => Math.round(v).toLocaleString() }, min: 0 },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}개 기관` } },
  };

  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = first && last && first !== last ? last.hospitals - first.hospitals : null;
  const spanPct = span !== null && first.hospitals > 0 ? (span / first.hospitals) * 100 : null;

  return (
    <Panel title="최근 연도별 확인 기관 수" desc={desc}>
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
          {span !== null && (
            <p className="fg-base mb-2 text-ui-sm tabular-nums">
              {first.year}년 {first.hospitals.toLocaleString()}개 → {last.year}년{" "}
              <b className="fg-strong">{last.hospitals.toLocaleString()}개</b> ·{" "}
              {span >= 0 ? "+" : "−"}
              {Math.abs(span).toLocaleString()}개
              {spanPct !== null && ` (${spanPct >= 0 ? "+" : "−"}${Math.abs(spanPct).toFixed(1)}%)`}
            </p>
          )}
          <ReactApexChart
            key={`${chartKey}-${chart.dark}`}
            options={options}
            series={[{ name: "확인 기관 수", data: rows.map((r) => r.hospitals) }]}
            type="bar"
            height={240}
          />
          <div className="mt-2 overflow-x-auto">
            <table className="table-cards table-dense">
              <thead>
                <tr>
                  <th className="th-dense">연도</th>
                  <th className="th-dense text-right">확인 기관 수</th>
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
                      <td data-label="연도" className="td-dense">{r.year}</td>
                      <td data-label="확인 기관 수" className="td-dense fg-strong text-right font-medium">{r.hospitals.toLocaleString()}</td>
                      <td data-label="전년 대비" className="td-dense fg-muted text-right">
                        {delta === null ? "—" : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()}`}
                      </td>
                      <td data-label="등록 대수" className="td-dense text-right">{r.units.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="fg-subtle mt-2 text-ui-xs">
            등록 기관 수의 순증이며 신규 구매·판매량을 뜻하지 않습니다. 기관별 신규 진입·이탈 건수는 공개
            데이터에 없어 증가·감소를 나누어 적지 않고 순증만 적습니다.
          </p>
        </>
      )}
    </Panel>
  );
}
