"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CatalogModelDetail,
  CatalogModelHospital,
  Paged,
  fetchCatalogModel,
  fetchCatalogModelHospitals,
} from "./api";
import {
  Crumbs,
  DataNote,
  DistPanel,
  SearchCta,
  YearPanel,
  categoryHref,
  equipmentSearchHref,
  hospitalHref,
  modelHref,
} from "./CatalogParts";
import { EmptyState, Pagination, Panel, StatTile, selectClass } from "./ui";

const PAGE_SIZE = 20;

export default function CatalogModelClient({ code, slug }: { code: string; slug: string }) {
  const [detail, setDetail] = useState<CatalogModelDetail | null>(null);
  const [list, setList] = useState<Paged<CatalogModelHospital> | null>(null);
  const [sido, setSido] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogModel(code, slug)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code, slug]);

  useEffect(() => {
    let alive = true;
    fetchCatalogModelHospitals(code, slug, { sido, page, page_size: PAGE_SIZE })
      .then((r) => alive && setList(r))
      .catch(() => alive && setList(null))
      .finally(() => alive && setListLoading(false));
    return () => {
      alive = false;
    };
  }, [code, slug, sido, page]);

  if (loading) return <EmptyState message="불러오는 중…" />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!detail) return <EmptyState message="모델을 찾을 수 없습니다." />;

  const topType = detail.stats.top_type;
  const firstYear = detail.years[0];
  const lastYear = detail.years[detail.years.length - 1];
  const yearDelta =
    detail.multi_year && firstYear && lastYear ? lastYear.hospitals - firstYear.hospitals : null;

  return (
    <div className="space-y-6">
      <Crumbs
        items={[
          { label: "의료기관 장비 검색", href: "/med/equipment-search" },
          { label: "의료장비 분류", href: "/med/equipment/categories" },
          { label: detail.name, href: categoryHref(detail.category) },
          { label: detail.model },
        ]}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="fg-strong text-ui-lg font-semibold">{detail.model}</span>
        <Link href={categoryHref(detail.category)} className="chip-quiet">
          {detail.name}
        </Link>
      </div>

      {detail.manufacturers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-eyebrow">제조·수입사</span>
          {detail.manufacturers.map((m) => (
            <span key={m.manufacturer} className="chip">
              {m.manufacturer}
              <span className="fg-subtle tabular-nums">{m.units.toLocaleString()}대</span>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="확인 의료기관"
          value={`${detail.stats.hospitals.toLocaleString()}개`}
          sub={`분류 내 ${detail.stats.rank}위 / ${detail.stats.models_in_category.toLocaleString()}종 · 분류 기관의 ${detail.stats.share.toFixed(1)}%`}
        />
        <StatTile
          label="등록 대수"
          value={`${detail.stats.units.toLocaleString()}대`}
          sub={`${detail.year}년 스냅샷`}
        />
        <StatTile
          label="가장 많은 종별"
          value={topType ? topType.key : "—"}
          sub={topType ? `${topType.hospitals.toLocaleString()}개 · ${topType.share.toFixed(1)}%` : undefined}
        />
        <StatTile
          label={yearDelta === null ? "연도 비교" : `${firstYear.year}년 대비 증감`}
          value={
            yearDelta === null
              ? "—"
              : `${yearDelta >= 0 ? "+" : "−"}${Math.abs(yearDelta).toLocaleString()}개`
          }
          sub={
            yearDelta === null
              ? "비교할 이전 스냅샷이 없습니다"
              : `${firstYear.hospitals.toLocaleString()}개 → ${lastYear.hospitals.toLocaleString()}개`
          }
        />
      </div>

      <Panel
        title="해당 모델을 등록한 기관"
        desc="보유 대수 순 · 시도를 고르면 그 지역만 봅니다"
        right={
          <select
            value={sido}
            onChange={(e) => {
              setSido(e.target.value);
              setPage(1);
              setListLoading(true);
            }}
            className={selectClass}
            aria-label="시도 선택"
          >
            <option value="">전국</option>
            {detail.regions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.key} ({r.hospitals.toLocaleString()})
              </option>
            ))}
          </select>
        }
      >
        {listLoading ? (
          <EmptyState message="병원 목록 불러오는 중…" />
        ) : list && list.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="table-cards table-dense min-w-[720px]">
                <thead>
                  <tr>
                    <th className="th-dense w-12 text-right">순위</th>
                    <th className="th-dense">기관명</th>
                    <th className="th-dense text-right">보유 대수</th>
                    <th className="th-dense">위치</th>
                    <th className="th-dense">종별</th>
                    <th className="th-dense">주소</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {list.items.map((h, i) => (
                    <tr key={h.hospital_id} className="row-hover">
                      <td data-label="순위" className="td-dense fg-subtle text-right">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td data-label="기관명" className="td-dense">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Link
                            href={hospitalHref(h.hospital_id)}
                            className="fg-strong truncate font-medium hover:underline"
                          >
                            {h.name}
                          </Link>
                          {h.is_member && <span className="chip-quiet shrink-0">회원</span>}
                        </span>
                      </td>
                      <td data-label="보유 대수" className="td-dense text-right">{h.units.toLocaleString()}대</td>
                      <td data-label="위치" className="td-dense fg-muted whitespace-nowrap">
                        {[h.sido, h.sigungu].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td data-label="종별" className="td-dense fg-muted whitespace-nowrap">{h.type || "—"}</td>
                      <td data-label="주소" className="td-dense fg-muted max-w-[280px] truncate">{h.address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={list.total}
              onChange={(p) => {
                setPage(p);
                setListLoading(true);
              }}
            />
          </>
        ) : (
          <EmptyState message="조건에 맞는 의료기관이 없습니다." />
        )}
      </Panel>

      <SearchCta
        href={equipmentSearchHref(detail.category, detail.model)}
        label="이 모델 보유 의료기관 검색"
      />

      <YearPanel
        rows={detail.years}
        multiYear={detail.multi_year}
        chartKey={`model-year-${detail.category}-${detail.slug}`}
        desc={`${detail.model} · 매년 12월 공개 등록 자료 기준`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DistPanel
          title="의료기관 종별 분포"
          desc="이 모델을 등록한 기관의 요양기관 종별"
          rows={detail.types}
          keyHeader="종별"
          chartKey={`model-type-${detail.category}-${detail.slug}`}
        />
        <DistPanel
          title="지역 분포"
          desc="시도별 확인 의료기관 수"
          rows={detail.regions}
          keyHeader="시도"
          chartKey={`model-region-${detail.category}-${detail.slug}`}
          max={8}
        />
      </div>

      {detail.peers.length > 0 && (
        <Panel
          title="같은 분류의 상위 모델"
          desc="순위·추천이 아니라 확인 의료기관 수 정렬입니다."
        >
          <div>
            {detail.peers.map((p) => (
              <Link key={p.slug} href={modelHref(detail.category, p.slug)} className="list-row">
                <span className="fg-strong min-w-0 flex-1 truncate font-medium">{p.model}</span>
                <span className="fg-muted shrink-0 text-ui-sm tabular-nums">
                  {p.hospitals.toLocaleString()}개 기관 · {p.units.toLocaleString()}대
                </span>
                <span className="fg-subtle shrink-0" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      )}

      <DataNote
        year={detail.year}
        extra="제조·수입사는 의료장비 허가 자료를 허가번호로 대조한 결과이며, 개별 의료기관의 계약·공급 경로를 뜻하지 않습니다."
      />
    </div>
  );
}
