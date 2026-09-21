"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ApexOptions } from "apexcharts";
import { useEffect, useMemo, useState } from "react";
import { CatalogHospitalDetail, CatalogHospitalGroup, fetchCatalogHospital } from "./api";
import { Crumbs, DataNote, categoryHref, hospitalHref, modelHref } from "./CatalogParts";
import { EmptyState, Panel, StatTile, selectClass, useChartTheme } from "./ui";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/** 처음에 펼쳐 두는 분류 수 — 상급종합은 150분류를 넘겨서 전부 펼치면 표가 수천 행이 된다. */
const OPEN_GROUPS = 6;

const SORTS = [
  { value: "delta", label: "최근 변화순" },
  { value: "name", label: "장비명순" },
  { value: "units", label: "등록 수량순" },
] as const;
type SortKey = (typeof SORTS)[number]["value"];

function deltaText(v: number | null): string {
  if (v === null) return "—";
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString()}`;
}

export default function HospitalDetailClient({ hospitalId }: { hospitalId: number }) {
  const [data, setData] = useState<CatalogHospitalDetail | null>(null);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<SortKey>("units");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const chart = useChartTheme();

  // 로딩 플래그는 effect가 아니라 연도를 바꾸는 핸들러에서 켠다 (effect 안 동기 setState 금지 규칙).
  useEffect(() => {
    let alive = true;
    fetchCatalogHospital(hospitalId, { year })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setExpanded(new Set(d.groups.slice(0, OPEN_GROUPS).map((g) => g.category)));
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [hospitalId, year]);

  const groups = useMemo(() => {
    const rows = [...(data?.groups || [])];
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else if (sort === "delta") rows.sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity));
    else rows.sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "ko"));
    return rows;
  }, [data, sort]);

  if (loading && !data) return <EmptyState message="장비 현황 불러오는 중…" />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="의료기관을 찾을 수 없습니다." />;

  const h = data.hospital;
  // 분류 정렬과 무관하게 '가장 많은 분류'는 등록 대수 기준이다.
  const topGroup = data.groups.reduce<CatalogHospitalGroup | null>(
    (best, g) => (best === null || g.units > best.units ? g : best),
    null,
  );
  const yearOptions: ApexOptions = {
    ...chart.base,
    chart: { ...chart.base.chart, type: "bar" },
    colors: [chart.series[0]],
    plotOptions: { bar: { borderRadius: 3, columnWidth: "55%", borderRadiusApplication: "end" } },
    xaxis: { categories: data.years.map((y) => String(y.year)), labels: { ...chart.axisLabel, rotate: 0 } },
    yaxis: { labels: { ...chart.axisLabel, formatter: (v: number) => Math.round(v).toLocaleString() } },
    tooltip: { ...chart.base.tooltip, y: { formatter: (v: number) => `${v.toLocaleString()}대` } },
  };

  const toggle = (category: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <div className="space-y-6">
      <Crumbs
        items={[
          { label: "의료기관 장비 검색", href: "/med/equipment-search" },
          { label: [h.sido, h.sigungu].filter(Boolean).join(" ") || "위치 미상" },
          { label: h.name },
        ]}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="fg-strong text-ui-lg font-semibold">{h.name}</span>
        {h.is_member && <span className="chip-quiet">회원</span>}
        {h.type && <span className="chip">{h.type}</span>}
        <span className="chip">{[h.sido, h.sigungu].filter(Boolean).join(" ") || "위치 미상"}</span>
        {h.estb_date && <span className="chip">개설 {h.estb_date}</span>}
      </div>
      {h.address && <p className="fg-muted text-ui-sm">{h.address}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="장비 분류"
          value={`${data.stats.categories.toLocaleString()}종`}
          sub={`${data.year}년 스냅샷`}
        />
        <StatTile
          label="등록 장비"
          value={`${data.stats.units.toLocaleString()}대`}
          sub={`모델 ${data.stats.models.toLocaleString()}종`}
        />
        <StatTile
          label={data.prev_year ? `${data.prev_year}년 대비 증감` : "직전 연도 대비"}
          value={data.stats.delta_units === null ? "—" : `${deltaText(data.stats.delta_units)}대`}
          sub={
            data.prev_year === null
              ? "비교할 이전 스냅샷이 없습니다"
              : data.stats.delta_skipped > 0
                ? `양쪽 스냅샷에 모두 있는 분류만 · ${data.stats.delta_skipped}종 제외`
                : "등록 대수 기준"
          }
        />
        <StatTile
          label="가장 많은 장비 분류"
          value={topGroup ? topGroup.name : "—"}
          sub={topGroup ? `${topGroup.units.toLocaleString()}대 · 모델 ${topGroup.models.toLocaleString()}종` : undefined}
        />
      </div>

      <Panel
        title="보유 장비"
        desc="장비 분류를 누르면 등록된 모델이 펼쳐집니다"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={data.year}
              onChange={(e) => {
                setLoading(true);
                setYear(Number(e.target.value));
              }}
              className={selectClass}
              aria-label="연도 선택"
            >
              {data.years
                .slice()
                .reverse()
                .map((y) => (
                  <option key={y.year} value={y.year}>
                    {y.year}년
                  </option>
                ))}
            </select>
            <div className="seg" role="group" aria-label="장비 정렬">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={sort === s.value}
                  onClick={() => setSort(s.value)}
                  className={`seg-item ${sort === s.value ? "seg-item-on" : ""}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {groups.length === 0 ? (
          <EmptyState message={`${data.year}년 스냅샷에 등록된 장비가 없습니다.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards table-dense min-w-[720px]">
              <thead>
                <tr>
                  <th className="th-dense">장비 · 모델</th>
                  <th className="th-dense">제조·수입사</th>
                  <th className="th-dense text-right">수량</th>
                  <th className="th-dense text-right">
                    {data.prev_year ? `${data.prev_year}년 대비` : "증감"}
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {groups.map((g) => (
                  <GroupRows
                    key={g.category}
                    group={g}
                    open={expanded.has(g.category)}
                    onToggle={() => toggle(g.category)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="연도별 등록 장비" desc="심평원 스냅샷별 등록 대수">
          {data.years.length < 2 ? (
            <EmptyState message="연도 비교를 할 수 있는 스냅샷이 하나뿐입니다." />
          ) : (
            <>
              <ReactApexChart
                key={`hosp-year-${h.id}-${chart.dark}`}
                options={yearOptions}
                series={[{ name: "등록 대수", data: data.years.map((y) => y.units) }]}
                type="bar"
                height={240}
              />
              <table className="table-cards table-dense mt-2">
                <thead>
                  <tr>
                    <th className="th-dense">연도</th>
                    <th className="th-dense text-right">장비 분류</th>
                    <th className="th-dense text-right">등록 대수</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.years
                    .slice()
                    .reverse()
                    .map((y) => (
                      <tr key={y.year} className="row-hover">
                        <td data-label="연도" className="td-dense">{y.year}</td>
                        <td data-label="장비 분류" className="td-dense fg-muted text-right">{y.categories.toLocaleString()}</td>
                        <td data-label="등록 대수" className="td-dense fg-strong text-right font-medium">{y.units.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="fg-subtle mt-2 text-ui-xs">
                2019~2022 스냅샷에는 레거시 6개 분류만 적재돼 있어 2023년에 분류 수가 크게 뜁니다.
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="같은 지역·종별 비교"
          desc={
            data.peers.available
              ? `${data.peers.sido} ${data.peers.sigungu}의 ${data.peers.type} ${data.peers.total.toLocaleString()}곳 중 등록 대수 상위`
              : undefined
          }
        >
          {!data.peers.available ? (
            <EmptyState message="지역·종별 정보가 없어 비교 대상을 만들 수 없습니다." />
          ) : (
            <>
              <p className="fg-muted mb-2 text-ui-sm">
                등록 대수 순위{" "}
                <strong className="fg-strong tabular-nums">
                  {data.peers.rank ?? "—"} / {data.peers.total.toLocaleString()}
                </strong>
              </p>
              <table className="table-cards table-dense">
                <thead>
                  <tr>
                    <th className="th-dense w-12 text-right">#</th>
                    <th className="th-dense">기관명</th>
                    <th className="th-dense text-right">장비 분류</th>
                    <th className="th-dense text-right">등록 대수</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.peers.items.map((p, i) => (
                    <tr key={p.hospital_id} className={`row-hover ${p.is_self ? "bg-brand-500/[0.06]" : ""}`}>
                      <td data-label="#" className="td-dense fg-subtle text-right">{i + 1}</td>
                      <td data-label="기관명" className="td-dense">
                        {p.is_self ? (
                          <span className="fg-strong font-semibold">{p.name}</span>
                        ) : (
                          <Link href={hospitalHref(p.hospital_id)} className="fg-strong font-medium hover:underline">
                            {p.name}
                          </Link>
                        )}
                      </td>
                      <td data-label="장비 분류" className="td-dense fg-muted text-right">{p.categories.toLocaleString()}</td>
                      <td data-label="등록 대수" className="td-dense fg-strong text-right font-medium">{p.units.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>

      <DataNote
        year={data.year}
        extra="본 장비 현황은 건강보험심사평가원에 등록된 사용 중 장비 기준이라 실제 운영 현황과 다를 수 있습니다. 제조·수입사는 의료장비 허가 자료를 허가번호로 대조한 결과이며 신뢰도(확인·유력·미확인)를 함께 표시합니다."
      />
    </div>
  );
}

/** 분류 헤더 한 줄 + 펼쳤을 때의 모델 행들. 분류가 150종을 넘을 수 있어 기본은 접어 둔다. */
function GroupRows({
  group,
  open,
  onToggle,
}: {
  group: CatalogHospitalGroup;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* 행 아무 데나 눌러도 펼쳐지되(마우스), 안에 분류 링크가 있어 행 자체를 버튼으로 만들 수는 없다.
          그래서 키보드용 펼침 버튼은 앞의 삼각형 하나가 맡는다. */}
      <tr className="row-hover cursor-pointer" onClick={onToggle}>
        <td data-label="장비 · 모델" className="td-dense">
          <span className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${group.name} ${open ? "접기" : "펼치기"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="fg-subtle shrink-0 text-ui-xs"
            >
              {open ? "▾" : "▸"}
            </button>
            <Link
              href={categoryHref(group.category)}
              onClick={(e) => e.stopPropagation()}
              className="fg-strong truncate font-medium hover:underline"
            >
              {group.name}
            </Link>
            <span className="chip-quiet shrink-0">{group.models}종</span>
          </span>
        </td>
        <td data-label="제조·수입사" className="td-dense fg-subtle">{group.code}</td>
        <td data-label="수량" className="td-dense fg-strong text-right font-semibold">{group.units.toLocaleString()}대</td>
        <td data-label="증감" className="td-dense fg-muted text-right">{deltaText(group.delta)}</td>
      </tr>
      {open &&
        group.items.map((it, i) => (
          <tr key={`${group.category}-${i}`} className="row-hover">
            <td data-label="모델" className="td-dense pl-8">
              {it.model && it.slug ? (
                <Link href={modelHref(group.category, it.slug)} className="link-quiet">
                  {it.model}
                </Link>
              ) : (
                <span className="fg-muted">{it.model || "모델 미상"}</span>
              )}
            </td>
            <td data-label="제조·수입사" className="td-dense fg-muted">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{it.manufacturer || "—"}</span>
                {it.confidence && <span className="chip-quiet shrink-0">{it.confidence}</span>}
              </span>
            </td>
            <td data-label="수량" className="td-dense text-right">{it.units.toLocaleString()}대</td>
            <td data-label="증감" className="td-dense fg-subtle text-right">{deltaText(it.delta)}</td>
          </tr>
        ))}
    </>
  );
}
