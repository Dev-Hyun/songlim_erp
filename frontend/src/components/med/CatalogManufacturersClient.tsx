"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogManufacturerSort, CatalogManufacturers, fetchCatalogManufacturers } from "./api";
import { DataNote, categoryHref } from "./CatalogParts";
import { EmptyState, Pagination, Panel, StatTile } from "./ui";

const PAGE_SIZE = 30;

const SORTS: { value: CatalogManufacturerSort; label: string }[] = [
  { value: "units", label: "등록 대수순" },
  { value: "hospitals", label: "보유 기관순" },
  { value: "models", label: "모델 수순" },
  { value: "name", label: "가나다순" },
];

export default function CatalogManufacturersClient() {
  const [data, setData] = useState<CatalogManufacturers | null>(null);
  const [sort, setSort] = useState<CatalogManufacturerSort>("units");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogManufacturers({ sort, page, page_size: PAGE_SIZE })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sort, page]);

  if (loading && !data) return <EmptyState message="불러오는 중…" />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="데이터가 없습니다." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="제조·수입사"
          value={`${data.totals.manufacturers.toLocaleString()}곳`}
          sub={`${data.year}년 스냅샷`}
        />
        <StatTile
          label="연결된 모델"
          value={`${data.totals.models.toLocaleString()}종`}
          sub="제조·수입사가 확인된 모델"
        />
        <StatTile
          label="등록 대수"
          value={`${data.totals.units.toLocaleString()}대`}
          sub="제조·수입사가 채워진 등록분"
        />
        <StatTile
          label="제조사 채움율"
          value={`${data.coverage.share.toFixed(1)}%`}
          sub={`${data.coverage.filled_rows.toLocaleString()} / ${data.coverage.total_rows.toLocaleString()}행`}
        />
      </div>

      {data.coverage.share < 99 && (
        <p className="rounded-control border border-warning-300 bg-warning-50 px-3 py-2 text-ui-xs text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
          <strong>제조사 데이터는 아직 일부만 채워져 있습니다.</strong> 심평원 &lsquo;의료장비 상세 현황&rsquo;
          원자료에는 제조사 컬럼이 없어, 현재 값은 사내 레거시 적재분({data.coverage.share.toFixed(1)}%)에서만 나옵니다.
          나머지 분류는 별도 적재가 끝나는 대로 이 화면에 함께 나타납니다.
          {!data.has_confidence && " 연결 신뢰도(확인·유력·미확인) 표기도 적재 이후에 붙습니다."}
        </p>
      )}

      {!data.available ? (
        <Panel title="제조·수입사">
          <EmptyState message="아직 제조사가 채워진 장비 등록 기록이 없습니다. 적재가 끝나면 이 목록이 채워집니다." />
        </Panel>
      ) : (
        <Panel
          title="제조·수입사"
          desc={`의료기관 등록 장비와 연결된 제조·수입사 ${data.total.toLocaleString()}곳 · 행을 누르면 그 업체가 연결된 장비 분류가 펼쳐집니다.`}
          right={
            <div className="seg" role="group" aria-label="제조사 정렬">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={sort === s.value}
                  onClick={() => {
                    setSort(s.value);
                    setPage(1);
                    setOpen(null);
                  }}
                  className={`seg-item ${sort === s.value ? "seg-item-on" : ""}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="table-dense min-w-[680px]">
              <thead>
                <tr>
                  <th className="th-dense w-12 text-right">#</th>
                  <th className="th-dense">업체명</th>
                  <th className="th-dense text-right">모델</th>
                  <th className="th-dense text-right">확인 의료기관</th>
                  <th className="th-dense text-right">등록 대수</th>
                  <th className="th-dense">연결된 의료장비 분류</th>
                  {data.has_confidence && <th className="th-dense">연결 신뢰도</th>}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.items.map((m) => {
                  const expanded = open === m.manufacturer;
                  return [
                    <tr
                      key={m.manufacturer}
                      className="row-hover cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : m.manufacturer)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        setOpen(expanded ? null : m.manufacturer);
                      }}
                    >
                      <td className="td-dense fg-subtle text-right">{m.rank}</td>
                      <td className="td-dense fg-strong font-medium">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="fg-subtle shrink-0">{expanded ? "▾" : "▸"}</span>
                          <span className="truncate">{m.manufacturer}</span>
                        </span>
                      </td>
                      <td className="td-dense text-right">{m.models.toLocaleString()}</td>
                      <td className="td-dense fg-strong text-right font-semibold">{m.hospitals.toLocaleString()}</td>
                      <td className="td-dense text-right">{m.units.toLocaleString()}</td>
                      <td className="td-dense fg-muted max-w-[260px] truncate">
                        {m.categories
                          .slice(0, 3)
                          .map((c) => c.name)
                          .join(" · ") || "없음"}
                        {m.category_count > 3 ? ` 외 ${m.category_count - 3}종` : ""}
                      </td>
                      {data.has_confidence && (
                        <td className="td-dense fg-muted">
                          {m.confidence
                            ? Object.entries(m.confidence)
                                .map(([k, v]) => `${k} ${v.toLocaleString()}`)
                                .join(" · ")
                            : "—"}
                        </td>
                      )}
                    </tr>,
                    expanded ? (
                      <tr key={`${m.manufacturer}-detail`}>
                        <td className="td-dense surface-sub" colSpan={data.has_confidence ? 7 : 6}>
                          <div className="flex flex-wrap gap-1.5">
                            {m.categories.map((c) => (
                              <Link key={c.category} href={categoryHref(c.category)} className="chip">
                                {c.name}
                                <span className="fg-subtle tabular-nums">
                                  모델 {c.models.toLocaleString()} · {c.units.toLocaleString()}대
                                </span>
                              </Link>
                            ))}
                            {m.category_count > m.categories.length && (
                              <span className="chip-quiet">외 {m.category_count - m.categories.length}종</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onChange={(p) => {
              setPage(p);
              setOpen(null);
            }}
          />
        </Panel>
      )}

      <DataNote
        year={data.year}
        extra="같은 업체의 표기 통합(대표명)은 아직 적용하지 않아 원문 표기 그대로 집계합니다. 등록 대수는 보유 대수·판매량이나 중복을 제거한 전체 의료기관 수가 아닙니다."
      />
    </div>
  );
}
