"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDeliveries } from "./api";
import { DeliveryListItem } from "./types";

const DEMO_RESULT_COLOR: Record<string, string> = {
  예정: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  진행중: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  성공: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  실패: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
};

export default function DeliveriesListClient() {
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [siteType, setSiteType] = useState<"delivery" | "demo">("delivery");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchDeliveries().then(setDeliveries).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      deliveries.filter((d) => {
        if (siteType && d.site_type !== siteType) return false;
        if (query && !d.hospital_name.includes(query)) return false;
        return true;
      }),
    [deliveries, siteType, query]
  );

  function handleCreate() {
    router.push("/deliveries/new");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {[
            { v: "delivery", l: "납품 & 관리" },
            { v: "demo", l: "DEMO" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setSiteType(t.v as "delivery" | "demo")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${siteType === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="병원명 검색..."
          className="w-52 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <button onClick={handleCreate} className="ml-auto rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
          + 새 납품 등록
        </button>
      </div>

      {loading && <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>}

      {!loading && (
        <div className="space-y-2">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => router.push(`/deliveries/${d.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{d.hospital_name}</div>
                <div className="mt-1 text-xs text-gray-400">설치일 {d.installation_date || "-"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    d.site_type === "demo"
                      ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                      : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                  }`}
                >
                  {d.site_type === "demo" ? "DEMO" : "납품 & 관리"}
                </span>
                {d.site_type === "demo" && d.demo_result && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${DEMO_RESULT_COLOR[d.demo_result] || "bg-gray-100 text-gray-500 dark:bg-white/10"}`}>
                    {d.demo_result}
                  </span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">등록된 건이 없습니다</div>}
        </div>
      )}
    </div>
  );
}
