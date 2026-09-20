"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CatalogModelAliases, fetchCatalogModelAliases } from "./api";
import { Crumbs, DataNote, modelHref } from "./CatalogParts";
import { EmptyState, Panel } from "./ui";

/**
 * 모델명 동음이의 선택 — 같은 모델명이 여러 장비 분류에 등록돼 있을 때 분류를 먼저 고르게 한다.
 * 슬러그가 분류 단위로 만들어지므로(같은 이름이라도 분류마다 슬러그가 다를 수 있다) 모델 상세로
 * 바로 보낼 수 없고 이 중간 화면이 필요하다. 갈래가 하나뿐이면 화면을 띄우지 않고 바로 넘긴다.
 */
export default function CatalogModelAliasClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [data, setData] = useState<CatalogModelAliases | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCatalogModelAliases(slug)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const only = data && data.options.length === 1 ? data.options[0] : null;
  useEffect(() => {
    // 갈래가 하나면 선택할 게 없다 — 뒤로 가기가 이 화면으로 되돌아오지 않게 replace로 넘긴다.
    if (only) router.replace(modelHref(only.category, only.slug));
  }, [only, router]);

  if (loading) return <EmptyState message="불러오는 중..." />;
  if (error) return <p className="text-ui text-red-500">{error}</p>;
  if (!data) return <EmptyState message="모델명을 찾을 수 없습니다." />;
  if (only) return <EmptyState message="모델 상세로 이동합니다..." />;

  const multiCategory = data.categories > 1;
  const title = multiCategory ? "여러 장비 분류에 있는 모델명" : "같은 분류 안의 표기 변형";
  const desc = multiCategory
    ? `같은 모델명이 ${data.categories}개 장비 분류에 등록되어 있습니다. 분류를 고르면 해당 모델 현황으로 갑니다.`
    : `같은 분류에 표기만 다른 등록이 ${data.options.length}건 있습니다. 심평원 신고 표기를 그대로 쓰기 때문입니다.`;

  return (
    <div className="space-y-6">
      <Crumbs
        items={[
          { label: "의료장비 모델", href: "/med/equipment/models" },
          { label: data.names[0] },
        ]}
      />

      <Panel title={title} desc={desc}>
        <div>
          {data.options.map((o) => (
            <Link key={`${o.category}-${o.slug}`} href={modelHref(o.category, o.slug)} className="list-row">
              <span className="min-w-0 flex-1">
                <span className="fg-strong block truncate font-medium">{o.name}</span>
                <span className="fg-subtle block truncate text-ui-xs">{o.model}</span>
              </span>
              <span className="fg-muted shrink-0 text-ui-sm tabular-nums">
                {o.hospitals.toLocaleString()}개 기관 · {o.units.toLocaleString()}대
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <DataNote year={data.year} />
    </div>
  );
}
