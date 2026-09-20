"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogModelIndex, fetchCatalogModelIndex } from "./api";
import { DataNote, modelHref, modelNameHref } from "./CatalogParts";
import { EmptyState, Panel, StatTile } from "./ui";

/**
 * 모델 탐색 시작점 — 분류를 거치지 않고 모델명으로 바로 들어가는 입구.
 * 메디하루 2-5절과 같이 입력 컨트롤도 페이지네이션도 두지 않는다. 전체 모델은 분류별 목록이
 * 맡고(분류 → 전체 모델), 여기는 확인 기관 수 상위 300종만 보여 주는 정적 목록이다.
 * 행을 누르면 그 분류의 모델 상세로 바로 간다.
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

  if (loading) return <EmptyState message="불러오는 중…" />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="데이터가 없습니다." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="색인된 모델" value={`${data.totals.pairs.toLocaleString()}종`} sub="분류 × 모델명 조합" />
        <StatTile label="모델명" value={`${data.totals.names.toLocaleString()}종`} sub="표기 차이를 합친 수" />
        <StatTile
          label="여러 분류에 걸친 모델명"
          value={`${data.totals.homonyms.toLocaleString()}종`}
          sub="분류를 먼저 골라야 합니다"
        />
        <StatTile
          label="이 화면 노출"
          value={`${data.items.length.toLocaleString()}종`}
          sub={`${data.year}년 스냅샷 상위`}
        />
      </div>

      <Panel
        title="의료장비 모델"
        desc={`색인 가능한 의료장비 모델 ${data.totals.pairs.toLocaleString()}종 가운데 탐색 시작점 ${data.items.length.toLocaleString()}종을 확인 의료기관 수 순으로 보여줍니다. 한 기관에서만 확인된 모델도 분류별 목록에서 탐색할 수 있습니다.`}
      >
        {data.items.length === 0 ? (
          <EmptyState message="색인된 모델이 없습니다." />
        ) : (
          <div>
            {data.items.map((r) => (
              <div key={`${r.category}-${r.slug}`} className="list-row">
                <Link href={modelHref(r.category, r.slug)} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="fg-strong block truncate font-medium">{r.model}</span>
                    <span className="fg-subtle block truncate text-ui-xs">{r.name}</span>
                  </span>
                  <span className="fg-muted shrink-0 text-ui-sm tabular-nums">
                    의료기관 {r.hospitals.toLocaleString()}개
                  </span>
                </Link>
                {/* 같은 모델명이 다른 분류에도 있다 — 분류 선택 화면으로 따로 보낸다(행 링크 안에 넣을 수 없다). */}
                {r.homonym && (
                  <Link href={modelNameHref(r.name_slug)} className="chip-quiet shrink-0">
                    여러 분류
                  </Link>
                )}
                <span className="fg-subtle shrink-0" aria-hidden>
                  →
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <DataNote
        year={data.year}
        extra="순위·추천이 아니라 확인 의료기관 수 정렬입니다 · 전체 모델은 분류별로 탐색하세요."
      />
    </div>
  );
}
