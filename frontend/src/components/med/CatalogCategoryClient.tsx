"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CatalogCategoryDetail,
  CatalogCategoryModels,
  fetchCatalogCategory,
  fetchCatalogCategoryModels,
} from "./api";
import {
  Crumbs,
  DataNote,
  DistPanel,
  MoreToggle,
  SearchCta,
  YearPanel,
  equipmentSearchHref,
  hospitalHref,
  modelHref,
} from "./CatalogParts";
import { EmptyState, Pagination, Panel, StatTile } from "./ui";

const PAGE_SIZE = 30;
/** 다수 등록 기관은 5곳만 먼저 보여주고 나머지는 펼친다 (메디하루 2-3). */
const TOP_HOSPITALS = 5;

export default function CatalogCategoryClient({ code }: { code: string }) {
  const [detail, setDetail] = useState<CatalogCategoryDetail | null>(null);
  const [models, setModels] = useState<CatalogCategoryModels | null>(null);
  const [allModels, setAllModels] = useState(false);
  const [openHospitals, setOpenHospitals] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogCategory(code)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  // 전체 모델 표는 펼쳤을 때만 받는다 — 접힌 상태에서는 상세 응답의 상위 12종으로 충분하다.
  useEffect(() => {
    if (!allModels) return;
    fetchCatalogCategoryModels(code, { page, page_size: PAGE_SIZE })
      .then(setModels)
      .catch(() => setModels(null));
  }, [code, page, allModels]);

  if (loading) return <EmptyState message="불러오는 중…" />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!detail) return <EmptyState message="분류를 찾을 수 없습니다." />;

  const topType = detail.stats.top_type;
  const hospitals = openHospitals ? detail.top_hospitals : detail.top_hospitals.slice(0, TOP_HOSPITALS);

  return (
    <div className="space-y-6">
      <Crumbs
        items={[
          { label: "의료기관 장비 검색", href: "/med/equipment-search" },
          { label: "의료장비 분류", href: "/med/equipment/categories" },
          { label: detail.name },
        ]}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="fg-strong text-ui-lg font-semibold">{detail.name}</span>
        <span className="chip-quiet">분류코드 {detail.code}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="확인 의료기관"
          value={`${detail.stats.hospitals.toLocaleString()}개`}
          sub={`${detail.year}년 스냅샷`}
        />
        <StatTile label="등록 대수" value={`${detail.stats.units.toLocaleString()}대`} sub="등록 기록 합계" />
        <StatTile
          label="가장 많은 종별"
          value={topType ? topType.key : "—"}
          sub={topType ? `${topType.hospitals.toLocaleString()}개 · 전체의 ${topType.share.toFixed(1)}%` : undefined}
        />
        <StatTile
          label="확인 모델"
          value={`${detail.stats.models.toLocaleString()}종`}
          sub="정규화 모델명 기준"
        />
      </div>

      <Panel
        title="확인 의료기관 수 상위 모델"
        desc="순위·추천이 아니라 확인 의료기관 수 정렬입니다."
      >
        {detail.top_models.length === 0 ? (
          <EmptyState message="모델 정보가 없습니다." />
        ) : !allModels ? (
          <>
            <div>
              {detail.top_models.map((m) => (
                <Link key={m.slug} href={modelHref(detail.category, m.slug)} className="list-row">
                  <span className="fg-strong min-w-0 flex-1 truncate font-medium">{m.model}</span>
                  <span className="fg-muted shrink-0 text-ui-sm tabular-nums">
                    {m.hospitals.toLocaleString()}개 기관 · {m.units.toLocaleString()}대
                  </span>
                  <span className="fg-subtle shrink-0" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-default mt-2"
              onClick={() => setAllModels(true)}
              aria-expanded={false}
            >
              이 분류의 전체 모델 보기 ({detail.stats.models.toLocaleString()}종) →
            </button>
          </>
        ) : models && models.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-cards table-dense min-w-[560px]">
                <thead>
                  <tr>
                    <th className="th-dense w-12 text-right">#</th>
                    <th className="th-dense">모델명</th>
                    <th className="th-dense text-right">확인 의료기관</th>
                    <th className="th-dense text-right">등록 대수</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {models.items.map((m) => (
                    <tr key={m.slug} className="row-hover">
                      <td data-label="#" className="td-dense fg-subtle text-right">{m.rank}</td>
                      <td data-label="모델명" className="td-dense">
                        <Link
                          href={modelHref(detail.category, m.slug)}
                          className="fg-strong font-medium hover:underline"
                        >
                          {m.model}
                        </Link>
                      </td>
                      <td data-label="확인 의료기관" className="td-dense fg-strong text-right font-semibold">{m.hospitals.toLocaleString()}</td>
                      <td data-label="등록 대수" className="td-dense text-right">{m.units.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={models.total} onChange={setPage} />
            <button
              type="button"
              className="btn btn-default mt-2"
              onClick={() => {
                setAllModels(false);
                setPage(1);
              }}
              aria-expanded
            >
              접기 ▴
            </button>
          </>
        ) : (
          <EmptyState message="모델 목록 불러오는 중…" />
        )}
      </Panel>

      <SearchCta href={equipmentSearchHref(detail.category)} label="이 분류 보유 의료기관 검색" />

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
          max={8}
        />
      </div>

      <YearPanel
        rows={detail.years}
        multiYear={detail.multi_year}
        chartKey={`cat-year-${detail.category}`}
        desc="매년 12월 공개 등록 자료 기준"
      />

      <Panel title="해당 장비를 다수 등록한 기관" desc="보유 대수 순">
        {detail.top_hospitals.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-cards table-dense min-w-[560px]">
                <thead>
                  <tr>
                    <th className="th-dense w-12 text-right">순위</th>
                    <th className="th-dense">기관명</th>
                    <th className="th-dense text-right">보유 대수</th>
                    <th className="th-dense">위치</th>
                    <th className="th-dense">종별</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {hospitals.map((h, i) => (
                    <tr key={h.hospital_id} className="row-hover">
                      <td data-label="순위" className="td-dense fg-subtle text-right">{i + 1}</td>
                      <td data-label="기관명" className="td-dense">
                        <Link href={hospitalHref(h.hospital_id)} className="fg-strong font-medium hover:underline">
                          {h.name}
                        </Link>
                      </td>
                      <td data-label="보유 대수" className="td-dense text-right">{h.units.toLocaleString()}대</td>
                      <td data-label="위치" className="td-dense fg-muted">{[h.sido, h.sigungu].filter(Boolean).join(" ") || "—"}</td>
                      <td data-label="종별" className="td-dense fg-muted">{h.type || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MoreToggle
              open={openHospitals}
              rest={detail.top_hospitals.length - TOP_HOSPITALS}
              unit="곳"
              onToggle={() => setOpenHospitals((v) => !v)}
            />
          </>
        ) : (
          <EmptyState message="데이터가 없습니다." />
        )}
      </Panel>

      <DataNote year={detail.year} />
    </div>
  );
}
