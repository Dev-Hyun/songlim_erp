"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CatalogCategories, fetchCatalogCategories } from "./api";
import { DataNote, categoryHref } from "./CatalogParts";
import { EmptyState, Panel, StatTile } from "./ui";

/** 정렬만 클릭으로 바꾼다 — 이 화면에는 텍스트 입력이 없다(병원명 검색은 장비 검색 화면 몫). */
const SORTS = [
  { value: "hospitals", label: "보유 기관순" },
  { value: "units", label: "등록 대수순" },
  { value: "models", label: "모델 수순" },
  { value: "name", label: "가나다순" },
] as const;
type SortKey = (typeof SORTS)[number]["value"];

export default function CatalogCategoriesClient() {
  const [data, setData] = useState<CatalogCategories | null>(null);
  const [sort, setSort] = useState<SortKey>("hospitals");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogCategories()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const items = [...(data?.items || [])];
    if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else items.sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name, "ko"));
    return items;
  }, [data, sort]);

  if (loading) return <EmptyState message="불러오는 중..." />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="데이터가 없습니다." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="장비 분류" value={data.totals.categories} sub="심평원 장비대분류" />
        <StatTile label="등록 의료기관" value={data.totals.hospitals} sub={`${data.year}년 스냅샷`} />
        <StatTile label="확인 모델" value={data.totals.models} sub="신고 모델명 기준" />
        <StatTile label="등록 대수" value={data.totals.units} sub="전 분류 합계" />
      </div>

      <Panel
        title="의료장비 분류"
        desc="분류를 누르면 모델 목록과 종별·지역 분포로 내려갑니다."
        right={
          <div className="seg" role="group" aria-label="분류 정렬">
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
        }
      >
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-dense min-w-[620px]">
            <thead>
              <tr>
                <th className="th-dense th-sticky w-12 text-right">#</th>
                <th className="th-dense th-sticky">분류명</th>
                <th className="th-dense th-sticky">분류코드</th>
                <th className="th-dense th-sticky text-right">보유 의료기관</th>
                <th className="th-dense th-sticky text-right">등록 대수</th>
                <th className="th-dense th-sticky text-right">모델</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r, i) => (
                <tr key={r.category} className="row-hover">
                  <td className="td-dense fg-subtle text-right">{i + 1}</td>
                  <td className="td-dense">
                    <Link href={categoryHref(r.category)} className="fg-strong font-medium hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="td-dense">
                    <span className="chip-quiet">{r.code}</span>
                  </td>
                  <td className="td-dense fg-strong text-right font-semibold">{r.hospitals.toLocaleString()}</td>
                  <td className="td-dense text-right">{r.units.toLocaleString()}</td>
                  <td className="td-dense fg-muted text-right">{r.models.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <DataNote year={data.year} extra="순위·추천이 아니라 확인 기관 수 정렬입니다" />
    </div>
  );
}
