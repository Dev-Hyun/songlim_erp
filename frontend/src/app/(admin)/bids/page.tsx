"use client";

import { Fragment, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface BidFile {
  name: string;
  url: string;
}

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
  files?: BidFile[] | null;
  days_left: number | null;
  expires_soon: boolean;
}

const EXT_COLORS: Record<string, string> = {
  hwp: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  hwpx: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  doc: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  docx: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  pdf: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  xls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  xlsx: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  ppt: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  pptx: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  zip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "FILE";
  return name.slice(i + 1).toUpperCase().slice(0, 4);
}

export default function BidsPage() {
  const [items, setItems] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (source) qs.set("source", source);
    if (search) qs.set("search", search);
    fetch(`${API}/api/bids?${qs.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }
  useEffect(load, [source, search]);

  return (
    <StaffOnly>
    <div>
      <PageBreadcrumb pageTitle="입찰정보" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 surface-card p-3">
          <div className="seg">
            {[
              { v: "", l: "전체" },
              { v: "G2B", l: "나라장터" },
              { v: "D2B", l: "국방전자조달" },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => setSource(t.v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${source === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
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
          <span className="ml-auto fg-subtle text-ui-sm">공고명을 클릭하면 첨부파일을 모두 볼 수 있습니다</span>
        </div>
        <div className="overflow-x-auto surface-card">
          {loading ? (
            <div className="empty-state">불러오는 중...</div>
          ) : (
            <table className="w-full text-ui">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left fg-subtle text-ui-sm dark:border-gray-800 dark:bg-white/[0.02]">
                  <th className="px-3 py-2">출처</th>
                  <th className="px-3 py-2">공고명</th>
                  <th className="px-3 py-2">수요기관</th>
                  <th className="px-3 py-2">추정가격</th>
                  <th className="px-3 py-2">마감일</th>
                  <th className="px-3 py-2">원문</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => {
                  const files = b.files || [];
                  const open = openId === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 align-top text-gray-400">{b.source || "-"}</td>
                        <td className="max-w-md px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setOpenId(open ? null : b.id)}
                            aria-expanded={open}
                            className="flex w-full items-start gap-1.5 text-left font-medium text-gray-800 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400"
                          >
                            <svg
                              className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M7 5l6 5-6 5V5z" />
                            </svg>
                            <span className="min-w-0 flex-1" title={b.title}>
                              {b.title}
                            </span>
                            {files.length > 0 && (
                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-ui-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                첨부 {files.length}
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{b.agency}</td>
                        <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{b.budget}</td>
                        <td className="px-3 py-2 align-top">
                          <span className={b.expires_soon ? "font-medium text-error-500" : "text-gray-700 dark:text-gray-300"}>
                            {b.end_date}
                            {b.expires_soon && " ⚠ 마감임박"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          {b.url ? (
                            <a
                              href={b.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-brand-500 hover:underline dark:text-brand-400"
                            >
                              원문 보기 ↗
                            </a>
                          ) : (
                            <span className="fg-subtle text-ui-sm">-</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                          <td colSpan={6} className="bg-gray-50 px-4 py-3 dark:bg-gray-900">
                            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                              첨부파일{files.length > 0 ? ` (${files.length})` : ""}
                            </p>
                            {files.length === 0 ? (
                              <p className="fg-subtle text-ui-sm">첨부파일 없음</p>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {files.map((f, i) => (
                                  <a
                                    key={`${f.url}-${i}`}
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={f.name}
                                    className="flex min-w-0 items-center gap-2 rounded-control border border-gray-200 bg-white px-3 py-2 hover:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
                                  >
                                    <span
                                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                        EXT_COLORS[fileExt(f.name).toLowerCase()] ||
                                        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                      }`}
                                    >
                                      {fileExt(f.name)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-200">
                                      {f.name}
                                    </span>
                                    <svg
                                      className="h-4 w-4 shrink-0 text-gray-400"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                      aria-hidden="true"
                                    >
                                      <path d="M10 3a1 1 0 011 1v6.6l2.3-2.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L9 10.6V4a1 1 0 011-1z" />
                                      <path d="M4 15a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" />
                                    </svg>
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center fg-subtle text-ui-sm">수집된 입찰정보가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    </StaffOnly>
  );
}
