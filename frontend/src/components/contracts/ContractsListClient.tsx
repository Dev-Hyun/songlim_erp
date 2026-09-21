"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchContracts } from "./api";
import { ContractListItem, ContractStatus } from "./types";
import StatusBadge, { StatusTone } from "@/components/ui/badge/StatusBadge";

// 상태는 배경 전체를 칠하지 않고 중성 칩 + 색 점으로만 구분한다(목록에 수십 개가 늘어서도 차분하게).
const STATUS_TONE: Record<ContractStatus, StatusTone> = {
  진행중: "progress",
  보류: "neutral",
  완료: "success",
};

const KANBAN_DOT: Record<ContractStatus, string> = {
  진행중: "bg-warning-500",
  보류: "bg-gray-400 dark:bg-gray-500",
  완료: "bg-success-500",
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

  const cols = "grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_84px_52px_88px]";

  return (
    <div className="space-y-3">
      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="seg">
          <button
            onClick={() => setView("list")}
            className={`seg-item ${view === "list" ? "seg-item-on" : ""}`}
          >
            목록
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`seg-item ${view === "kanban" ? "seg-item-on" : ""}`}
          >
            칸반
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="field"
        >
          <option value="">전체 상태</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 / 병원명 검색"
          className="field w-44 sm:w-56"
        />
        <span className="fg-subtle ml-auto hidden text-ui-sm sm:block">
          {filtered.length}건
        </span>
        <button onClick={handleCreate} className="btn btn-primary ml-auto sm:ml-0">
          새 계약 건
        </button>
      </div>

      {loading && <div className="surface-card empty-state">불러오는 중...</div>}

      {!loading && view === "list" && (
        <div className="surface-card overflow-hidden">
          <div
            className={`hidden gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900 sm:grid ${cols}`}
          >
            <span className="label-eyebrow">계약 건</span>
            <span className="label-eyebrow">병원</span>
            <span className="label-eyebrow">수정일</span>
            <span className="label-eyebrow text-right">댓글</span>
            <span className="label-eyebrow text-right">상태</span>
          </div>
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/contracts/${c.id}`)}
              className={`grid w-full items-center gap-x-3 gap-y-1 border-b border-gray-100 px-3 py-3 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03] sm:py-2 ${cols}`}
            >
              <span className="fg-strong min-w-0 truncate text-ui font-medium">
                {c.title}
              </span>
              <span className="fg-muted hidden min-w-0 truncate text-ui sm:block">
                {c.buyer_hospital || "-"}
              </span>
              <span className="fg-subtle hidden text-ui-sm tabular-nums sm:block">
                {c.updated_at?.slice(0, 10)}
              </span>
              <span className="fg-subtle hidden text-right text-ui-sm tabular-nums sm:block">
                {c.comment_count}
              </span>
              <span className="flex justify-end">
                <StatusBadge tone={STATUS_TONE[c.status]}>{c.status}</StatusBadge>
              </span>
              {/* 폰 전용 둘째 줄 — 데스크톱에서 별도 칸으로 보이는 값들을 숨기지 않고 여기 모아 둔다 */}
              <span className="fg-subtle col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-ui-sm sm:hidden">
                <span className="min-w-0 truncate">{c.buyer_hospital || "병원 미지정"}</span>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{c.updated_at?.slice(0, 10)}</span>
                {c.comment_count > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">댓글 {c.comment_count}</span>
                  </>
                )}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="empty-state">계약 건이 없습니다</div>}
        </div>
      )}

      {!loading && view === "kanban" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STATUSES.map((s) => (
            <div key={s} className="surface-sub rounded-card border border-gray-200 p-2 dark:border-gray-800">
              <div className="mb-2 flex items-center gap-1.5 px-1 py-0.5">
                <span className={`dot ${KANBAN_DOT[s]}`} />
                <span className="fg-base text-ui font-medium">{s}</span>
                <span className="fg-subtle text-ui-sm tabular-nums">
                  {filtered.filter((c) => c.status === s).length}
                </span>
              </div>
              <div className="space-y-1.5">
                {filtered
                  .filter((c) => c.status === s)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => router.push(`/contracts/${c.id}`)}
                      className="w-full rounded-control border border-gray-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
                    >
                      <div className="fg-strong truncate text-ui font-medium">{c.title}</div>
                      <div className="fg-subtle mt-0.5 truncate text-ui-sm">
                        {c.buyer_hospital || "-"}
                      </div>
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
