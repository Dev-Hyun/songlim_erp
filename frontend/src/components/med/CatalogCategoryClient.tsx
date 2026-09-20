"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CatalogCategoryDetail,
  CatalogCategoryModels,
  fetchCatalogCategory,
  fetchCatalogCategoryModels,
} from "./api";
import { Crumbs, DataNote, DistPanel, YearPanel, modelHref } from "./CatalogParts";
import { EmptyState, Pagination, Panel, StatTile } from "./ui";

const PAGE_SIZE = 30;

export default function CatalogCategoryClient({ code }: { code: string }) {
  const [detail, setDetail] = useState<CatalogCategoryDetail | null>(null);
  const [models, setModels] = useState<CatalogCategoryModels | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogCategory(code)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    fetchCatalogCategoryModels(code, { page, page_size: PAGE_SIZE })
      .then(setModels)
      .catch(() => setModels(null));
  }, [code, page]);

  if (loading) return <EmptyState message="불러오는 중..." />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!detail) return <EmptyState message="분류를 찾을 수 없습니다." />;

  const topType = detail.stats.top_type;

  return (
    <div className="space-y-6">
      <Crumbs
        items={[
          { label: "의료장비 분류", href: "/med/equipment/categories" },
          { label: detail.name },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="확인 의료기관" value={detail.stats.hospitals} sub={`${detail.year}년 스냅샷`} />
        <StatTile label="등록 대수" value={detail.stats.units} sub={`분류코드 ${detail.code}`} />
        <StatTile label="확인 모델" value={detail.stats.models} sub="신고 모델명 기준" />
        <StatTile
          label="가장 많은 종별"
          value={topType ? topType.key : "—"}
          sub={topType ? `${topType.hospitals.toLocaleString()}개 · 전체의 ${topType.share.toFixed(1)}%` : undefined}
        />
      </div>

      <Panel
        title={`${detail.name} 전체 모델`}
        desc={`개별 현황 페이지가 있는 모델 ${detail.stats.models.toLocaleString()}종 · 확인 의료기관 수 순 · 모델을 누르면 보유 의료기관이 나옵니다`}
      >
        {models && models.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-dense min-w-[560px]">
                <thead>
                  <tr>
                    <th className="th-dense w-12 text-right">#</th>
                    <th className="th-dense">모델명</th>
                    <th className="th-dense text-right">보유 의료기관</th>
                    <th className="th-dense text-right">등록 대수</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {models.items.map((m) => (
                    <tr key={m.slug} className="row-hover">
                      <td className="td-dense fg-subtle text-right">{m.rank}</td>
                      <td className="td-dense">
                        <Link
                          href={modelHref(detail.category, m.slug)}
                          className="fg-strong font-medium hover:underline"
                        >
                          {m.model}
                        </Link>
                      </td>
                      <td className="td-dense fg-strong text-right font-semibold">{m.hospitals.toLocaleString()}</td>
                      <td className="td-dense text-right">{m.units.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={models.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState message="모델 정보가 없습니다." />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DistPanel
          title="의료기관 종별 분포"
          desc="이 분류를 등록한 기관을 요양기관 종별로 나눈 값"
          rows={detail.types}
          keyHeader="종별"
          chartKey={`cat-type-${detail.category}`}
        />
        <DistPanel
          title="지역 분포"
          desc="시도별 확인 의료기관 수"
          rows={detail.regions}
          keyHeader="시도"
          chartKey={`cat-region-${detail.category}`}
          max={17}
        />
      </div>

      <YearPanel
        rows={detail.years}
        multiYear={detail.multi_year}
        chartKey={`cat-year-${detail.category}`}
        desc="매년 12월 공개 등록 자료 기준"
      />

      <Panel title="해당 장비를 다수 등록한 기관" desc="보유 대수 순 상위 10곳">
        {detail.top_hospitals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table-dense min-w-[560px]">
              <thead>
                <tr>
                  <th className="th-dense w-12 text-right">#</th>
                  <th className="th-dense">기관명</th>
                  <th className="th-dense text-right">보유 대수</th>
                  <th className="th-dense">위치</th>
                  <th className="th-dense">종별</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {detail.top_hospitals.map((h, i) => (
                  <tr key={h.hospital_id} className="row-hover">
                    <td className="td-dense fg-subtle text-right">{i + 1}</td>
                    <td className="td-dense fg-strong font-medium">{h.name}</td>
                    <td className="td-dense text-right">{h.units.toLocaleString()}대</td>
                    <td className="td-dense fg-muted">{[h.sido, h.sigungu].filter(Boolean).join(" ") || "—"}</td>
                    <td className="td-dense fg-muted">{h.type || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="데이터가 없습니다." />
        )}
      </Panel>

      <DataNote year={detail.year} />
    </div>
  );
}
