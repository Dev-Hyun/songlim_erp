"use client";

import { Fragment, useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import BidDetail, { type BidItem } from "@/components/bids/BidDetail";
import { Pagination, StatTile } from "@/components/med/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
const PAGE_SIZE = 30;

interface BidsResponse {
  total: number;
  items: BidItem[];
  category_counts: { name: string; count: number }[];
  summary: { open: number; closing_soon: number; new_today: number };
}

/** 9,500만 원 · 1.2억 원 (값이 없으면 저장된 글자 그대로) */
function won(b: BidItem): string {
  const n = b.budget_amount;
  if (!n) return b.budget && b.budget !== "0원" ? b.budget : "미정";
  if (n >= 100_000_000) return `${Number((n / 100_000_000).toFixed(2))}억 원`;
  return `${Math.round(n / 10_000).toLocaleString()}만 원`;
}

function dday(b: BidItem): { text: string; cls: string } {
  const d = b.days_left;
  if (d === null) return { text: "-", cls: "fg-subtle" };
  if (d < 0) return { text: "마감", cls: "fg-subtle" };
  if (d === 0) return { text: "오늘 마감", cls: "font-semibold text-error-500" };
  return { text: `D-${d}`, cls: d <= 3 ? "font-semibold text-error-500" : "fg-strong font-semibold" };
}

/** 'YYYY-MM-DD HH:MM' → 'MM.DD HH:MM' */
function short(dt: string | null): string {
  if (!dt || !/^\d{4}-\d{2}-\d{2}/.test(dt)) return dt || "-";
  return dt.slice(5).replace("-", ".");
}

const STATUS = [
  { v: "open", l: "진행 중" },
  { v: "closed", l: "마감" },
  { v: "all", l: "전체" },
];
const SOURCES = [
  { v: "", l: "전체" },
  { v: "G2B", l: "나라장터" },
  { v: "D2B", l: "국방전자조달" },
];
const SORTS = [
  { v: "notice", l: "최신 공고순" },
  { v: "deadline", l: "마감 임박순" },
  { v: "budget", l: "추정가격 높은순" },
];

export default function BidsPage() {
  const [data, setData] = useState<(BidsResponse & { key: string }) | null>(null);
  const [status, setStatus] = useState("open");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("notice");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  // 조건이 바뀌면 첫 쪽으로
  const change = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };

  // 검색어는 입력을 멈추고 0.3초 뒤에 반영
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const qs = new URLSearchParams({ status, sort, page: String(page), size: String(PAGE_SIZE) });
  if (source) qs.set("source", source);
  if (category) qs.set("category", category);
  if (search) qs.set("search", search);
  const key = qs.toString();
  const loading = data?.key !== key;

  useEffect(() => {
    fetch(`${API}/api/bids?${key}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: BidsResponse) => setData({ ...d, key }));
  }, [key]);

  const items = data?.items || [];
  const counts = data?.category_counts || [];

  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="입찰정보" />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="진행 중 공고" value={data ? data.summary.open : "-"} sub="마감 전 의료장비 입찰" />
            <StatTile label="3일 안 마감" value={data ? data.summary.closing_soon : "-"} sub="놓치기 전에 확인" />
            <StatTile label="오늘 새 공고" value={data ? data.summary.new_today : "-"} sub="오늘 올라온 공고" />
          </div>

          <div className="surface-card">
            <div className="toolbar">
              <div className="seg">
                {STATUS.map((t) => (
                  <button key={t.v} onClick={() => change(setStatus)(t.v)} className={`seg-item ${status === t.v ? "seg-item-on" : ""}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div className="seg">
                {SOURCES.map((t) => (
                  <button key={t.v} onClick={() => change(setSource)(t.v)} className={`seg-item ${source === t.v ? "seg-item-on" : ""}`}>
                    {t.l}
                  </button>
                ))}
              </div>
              <select value={sort} onChange={(e) => change(setSort)(e.target.value)} className="field" aria-label="정렬">
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </select>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="공고명·수요기관·품명·공고번호 검색"
                className="field w-full sm:ml-auto sm:w-72"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
              <span className="label-eyebrow mr-1">장비 분류</span>
              <button
                onClick={() => change(setCategory)("")}
                className={`seg-item rounded-control border ${category === "" ? "seg-item-on border-gray-300 dark:border-gray-600" : "border-gray-200 dark:border-gray-800"}`}
              >
                전체
              </button>
              {counts.map((c) => (
                <button
                  key={c.name}
                  onClick={() => change(setCategory)(category === c.name ? "" : c.name)}
                  aria-pressed={category === c.name}
                  className={`seg-item rounded-control border ${category === c.name ? "seg-item-on border-gray-300 dark:border-gray-600" : "border-gray-200 dark:border-gray-800"}`}
                >
                  {c.name}
                  <span className="fg-subtle tabular-nums">{c.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto surface-card">
            {loading && !data ? (
              <div className="empty-state">불러오는 중...</div>
            ) : (
              <table className={`table-cards w-full text-ui ${loading ? "opacity-60" : ""}`}>
                <thead>
                  <tr>
                    <th className="th-dense">마감</th>
                    <th className="th-dense">공고명</th>
                    <th className="th-dense">수요기관</th>
                    <th className="th-dense text-right">추정가격</th>
                    <th className="th-dense">공고일</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => {
                    const open = openId === b.id;
                    const d = dday(b);
                    const files = b.files || [];
                    return (
                      <Fragment key={b.id}>
                        <tr className="row-hover">
                          <td data-label="마감" className="td-dense whitespace-nowrap align-top">
                            <span className={`block text-ui-md tabular-nums ${d.cls}`}>{d.text}</span>
                            <span className="fg-muted block text-ui-xs tabular-nums">{short(b.end_date)}</span>
                          </td>
                          <td data-label="공고명" className="td-dense max-w-xl align-top">
                            <button
                              type="button"
                              onClick={() => setOpenId(open ? null : b.id)}
                              aria-expanded={open}
                              className="flex w-full min-w-0 items-start gap-1.5 text-left"
                            >
                              <svg
                                className={`mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <path d="M7 5l6 5-6 5V5z" />
                              </svg>
                              <span className="min-w-0 flex-1">
                                <span className="fg-strong font-medium hover:text-brand-500 dark:hover:text-brand-400">
                                  {b.notice_kind && b.notice_kind !== "등록공고" && (
                                    <span
                                      className={`chip mr-1.5 align-middle ${b.notice_kind === "취소공고" ? "text-error-600 dark:text-error-400" : ""}`}
                                    >
                                      {b.notice_kind.replace("공고", "")}
                                    </span>
                                  )}
                                  {b.title}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-1">
                                  {b.categories.map((c) => (
                                    <span key={c} className="chip">
                                      <span className="dot bg-brand-500" />
                                      {c}
                                    </span>
                                  ))}
                                  <span className="chip-quiet">{b.source === "D2B" ? "국방" : "나라장터"}</span>
                                  {files.length > 0 && <span className="chip-quiet">첨부 {files.length}</span>}
                                  {b.items && (
                                    <span className="fg-muted min-w-0 truncate text-ui-xs" title={b.items}>
                                      {b.items}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td data-label="수요기관" className="td-dense align-top">{b.agency || "-"}</td>
                          <td data-label="추정가격" className="td-dense whitespace-nowrap align-top tabular-nums sm:text-right">
                            {won(b)}
                          </td>
                          <td data-label="공고일" className="td-dense whitespace-nowrap align-top tabular-nums">
                            {short(b.notice_date || b.start_date)}
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={5} className="border-b border-gray-100 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
                              <BidDetail bid={b} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-state">
                        조건에 맞는 입찰정보가 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              onChange={(p) => {
                setPage(p);
                setOpenId(null);
              }}
            />
          )}
          <p className="fg-subtle text-ui-xs">
            출처: 조달청 나라장터 물품 입찰공고(최근 14일, 매일 07:00 갱신)·국방전자조달. 공고 제목과 구매대상물품(물품분류 42 의료장비)으로
            의료장비 공고를 골라 분류했습니다. 정확한 규격·자격은 원문을 확인하세요.
          </p>
        </div>
      </div>
    </StaffOnly>
  );
}
