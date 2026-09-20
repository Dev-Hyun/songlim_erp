"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogCategories, fetchCatalogCategories } from "./api";
import { DataNote, categoryHref } from "./CatalogParts";
import { EmptyState, Panel, StatTile } from "./ui";

/**
 * 의료장비 분류 목록 — 메디하루 2-2.
 * 입력 컨트롤도 정렬 컨트롤도 두지 않는다. 확인 의료기관 수 내림차순 고정이고,
 * 행 전체가 분류 상세로 가는 링크다(부분 링크가 아니다).
 */
export default function CatalogCategoriesClient() {
  const [data, setData] = useState<CatalogCategories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogCategories()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <EmptyState message="불러오는 중…" />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="데이터가 없습니다." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="장비 분류" value={`${data.totals.categories.toLocaleString()}종`} sub="심평원 장비대분류" />
        <StatTile
          label="등록 의료기관"
          value={`${data.totals.hospitals.toLocaleString()}개`}
          sub={`${data.year}년 스냅샷`}
        />
        <StatTile label="확인 모델" value={`${data.totals.models.toLocaleString()}종`} sub="정규화 모델명 기준" />
        <StatTile label="등록 대수" value={`${data.totals.units.toLocaleString()}대`} sub="전 분류 합계" />
      </div>

      <Panel
        title="의료장비 분류"
        desc="확인 의료기관 수 순 · 분류를 누르면 모델 목록과 종별·지역 분포로 내려갑니다."
      >
        <div>
          {data.items.map((r) => (
            <Link key={r.category} href={categoryHref(r.category)} className="list-row">
              <span className="fg-strong min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <span className="fg-muted shrink-0 text-ui-sm tabular-nums">
                모델 {r.models.toLocaleString()}종 · 의료기관 {r.hospitals.toLocaleString()}개
              </span>
              <span className="fg-subtle shrink-0" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <DataNote year={data.year} extra="순위·추천이 아니라 확인 의료기관 수 정렬입니다." />
    </div>
  );
}
