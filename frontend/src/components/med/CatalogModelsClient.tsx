"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogModelIndex, fetchCatalogModelIndex } from "./api";
import { DataNote, categoryHref, modelHref, modelNameHref } from "./CatalogParts";
import { EmptyState, Panel, StatTile } from "./ui";

/**
 * 모델 탐색 시작점 — 분류를 거치지 않고 모델명으로 바로 들어가는 입구.
 * 메디하루 2-5절과 같이 입력 컨트롤도 페이지네이션도 두지 않는다. 전체 모델은 분류별 목록이
 * 맡고(분류 → 전체 모델), 여기는 확인 기관 수 상위 300종만 보여 주는 정적 목록이다.
 */
export default function CatalogModelsClient() {
  const [data, setData] = useState<CatalogModelIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogModelIndex()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <EmptyState message="불러오는 중..." />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="데이터가 없습니다." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="색인된 모델" value={data.totals.pairs} sub="분류 × 모델명 조합" />
        <StatTile label="모델명" value={data.totals.names} sub="표기 차이를 합친 수" />
        <StatTile
          label="여러 분류에 걸친 모델명"
          value={data.totals.homonyms}
          sub="분류를 먼저 골라야 합니다"
        />
        <StatTile label="이 화면 노출" value={data.items.length} sub={`${data.year}년 스냅샷 상위`} />
      </div>

      <Panel
        title="의료장비 모델"
        desc={`색인 가능한 모델 ${data.totals.pairs.toLocaleString()}종 가운데 탐색 시작점 ${data.items.length.toLocaleString()}종을 확인 의료기관 수 순으로 보여줍니다. 한 기관에서만 확인된 모델도 분류별 목록에서 탐색할 수 있습니다.`}
      >
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-dense min-w-[680px]">
            <thead>
              <tr>
                <th className="th-dense th-sticky w-12 text-right">#</th>
                <th className="th-dense th-sticky">모델명</th>
                <th className="th-dense th-sticky">장비 분류</th>
                <th className="th-dense th-sticky text-right">확인 의료기관</th>
                <th className="th-dense th-sticky text-right">등록 대수</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.items.map((r, i) => (
                <tr key={`${r.category}-${r.slug}`} className="row-hover">
                  <td className="td-dense fg-subtle text-right">{i + 1}</td>
                  <td className="td-dense">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href={modelHref(r.category, r.slug)}
                        className="fg-strong truncate font-medium hover:underline"
                      >
                        {r.model}
                      </Link>
                      {r.homonym && (
                        <Link href={modelNameHref(r.name_slug)} className="chip-quiet shrink-0">
                          여러 분류
                        </Link>
                      )}
                    </span>
                  </td>
                  <td className="td-dense">
                    <Link href={categoryHref(r.category)} className="link-quiet">
                      {r.name}
                    </Link>
                  </td>
                  <td className="td-dense fg-strong text-right font-semibold">{r.hospitals.toLocaleString()}</td>
                  <td className="td-dense text-right">{r.units.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <DataNote
        year={data.year}
        extra="순위·추천이 아니라 확인 기관 수 정렬입니다 · 전체 모델은 분류별로 탐색하세요"
      />
    </div>
  );
}
