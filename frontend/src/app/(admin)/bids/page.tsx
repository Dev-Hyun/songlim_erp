"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface BidItem {
  id: number;
  bid_no: string;
  source: string | null;
  title: string;
  agency: string | null;
  budget: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  days_left: number | null;
  expires_soon: boolean;
}

export default function BidsPage() {
  const [items, setItems] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (source) qs.set("source", source);
    if (search) qs.set("search", search);
    fetch(`${API}/api/bids?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }
  useEffect(load, [source, search]);

  return (
    <div>
      <PageBreadcrumb pageTitle="입찰정보" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
            {[
              { v: "", l: "전체" },
              { v: "G2B", l: "나라장터" },
              { v: "D2B", l: "국방전자조달" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => setSource(t.v)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${source === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
              >
                {t.l}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="공고명/수요기관 검색..."
            className="w-56 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
          <span className="ml-auto text-xs text-gray-400">나라장터(G2B)·국방전자조달(D2B) 자동수집 · 매일 07:00 갱신</span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
                  <th className="px-3 py-2">출처</th>
                  <th className="px-3 py-2">공고명</th>
                  <th className="px-3 py-2">수요기관</th>
                  <th className="px-3 py-2">추정가격</th>
                  <th className="px-3 py-2">마감일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 text-gray-400">{b.source || "-"}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-white/90">
                      {b.url ? (
                        <a href={b.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {b.title}
                        </a>
                      ) : (
                        b.title
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{b.agency}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{b.budget}</td>
                    <td className="px-3 py-2">
                      <span className={b.expires_soon ? "font-bold text-error-500" : "text-gray-700 dark:text-gray-300"}>
                        {b.end_date}
                        {b.expires_soon && " ⚠ 마감임박"}
                      </span>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-xs text-gray-400">수집된 입찰정보가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
