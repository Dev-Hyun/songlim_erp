"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchContracts } from "./api";
import { ContractListItem, ContractStatus } from "./types";

const STATUS_COLOR: Record<ContractStatus, string> = {
  진행중: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  보류: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
};

const STATUSES: ContractStatus[] = ["진행중", "보류", "완료"];

export default function ContractsListClient() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  function load() {
    setLoading(true);
    fetchContracts()
      .then(setContracts)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (query && !`${c.title} ${c.buyer_hospital || ""}`.includes(query)) return false;
      return true;
    });
  }, [contracts, statusFilter, query]);

  function handleCreate() {
    router.push("/contracts/new");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          <button
            onClick={() => setView("list")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${view === "list" ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            ☰ 목록
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${view === "kanban" ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            ⬛ 칸반
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="">전체 상태</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목/병원명 검색..."
          className="w-52 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <button onClick={handleCreate} className="ml-auto rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
          + 새 계약 건
        </button>
      </div>

      {loading && <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>}

      {!loading && view === "list" && (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/contracts/${c.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.buyer_hospital && <span className="shrink-0 truncate text-xs font-normal text-gray-400">🏥 {c.buyer_hospital}</span>}
                </div>
                <div className="mt-1 w-20 shrink-0 text-xs text-gray-400">{c.updated_at?.slice(0, 10)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/10">💬 {c.comment_count}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOR[c.status]}`}>{c.status}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">계약 건이 없습니다</div>}
        </div>
      )}

      {!loading && view === "kanban" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STATUSES.map((s) => (
            <div key={s} className="rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.02]">
              <div className="mb-2 text-xs font-bold text-gray-500">{s} ({filtered.filter((c) => c.status === s).length})</div>
              <div className="space-y-2">
                {filtered
                  .filter((c) => c.status === s)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/contracts/${c.id}`)}
                      className={`w-full rounded-lg border-l-4 bg-white p-3 text-left text-xs shadow-sm dark:bg-gray-900 ${
                        s === "진행중" ? "border-warning-500" : s === "완료" ? "border-success-500" : "border-gray-400"
                      }`}
                    >
                      <div className="font-semibold text-gray-800 dark:text-white/90">{c.title}</div>
                      <div className="mt-1 text-gray-400">{c.buyer_hospital}</div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
