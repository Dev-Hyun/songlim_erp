"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface NewsItem {
  id: number;
  title: string;
  link: string | null;
  source: string | null;
  thumbnail: string | null;
  rank: number;
  created_at: string;
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");

  function load() {
    setLoading(true);
    const qs = source ? `?source=${encodeURIComponent(source)}` : "";
    fetch(`${API}/api/news${qs}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }
  useEffect(load, [source]);

  return (
    <div>
      <PageBreadcrumb pageTitle="의료소식" />
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
            {[
              { v: "", l: "전체" },
              { v: "MedicalTimes", l: "MedicalTimes" },
              { v: "의협신문", l: "의협신문" },
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
          <span className="ml-auto text-xs text-gray-400">MedicalTimes(RSS)·의협신문 인기기사 자동수집 · 매일 07:00/13:00 갱신</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">수집된 소식이 없습니다</div>
          ) : (
            items.map((n) => (
              <a
                key={n.id}
                href={n.link || undefined}
                target={n.link ? "_blank" : undefined}
                rel="noreferrer"
                className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02]"
              >
                {n.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.thumbnail} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90">{n.title}</span>
                  <span className="text-xs text-gray-400">
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 dark:bg-white/10">{n.source}</span>
                    {" · "}
                    {n.created_at?.slice(0, 10)}
                  </span>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
