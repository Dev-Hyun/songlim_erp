"use client";

import { useCallback, useEffect, useState } from "react";
import { ChangeLogEntry, fetchHistory } from "./api";

const FIELD_LABEL: Record<string, string> = {
  grade: "등급",
  name: "이름",
  serial_no: "S/N",
  location: "위치",
  notes: "비고",
  manufacture_date: "제조년월",
  manufacturer: "제조사",
  purchase_price: "매입가",
  purchase_from: "매입처",
  is_opened: "개봉",
  item_type: "구분",
  category: "분류",
};

/** UTC ISO 문자열 → 로컬(한국) 표시. Date 파싱 후 toLocaleString이라 시간대가 올바르게 변환된다. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function Value({ text, tone }: { text: string | null; tone: "old" | "new" }) {
  const empty = !text;
  return (
    <span
      className={`rounded-control px-1.5 py-0.5 text-ui-xs ${
        empty
          ? "fg-subtle italic"
          : tone === "old"
            ? "surface-inset fg-muted line-through"
            : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
      }`}
    >
      {empty ? "(비어 있음)" : text}
    </span>
  );
}

export default function HistoryPanel({
  category,
  rowId,
  rowLabel,
  refreshKey,
  onClose,
  onClearRowFilter,
}: {
  category: string;
  rowId?: number;
  rowLabel?: string;
  refreshKey: number;
  onClose: () => void;
  onClearRowFilter: () => void;
}) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchHistory({ category, rowId, limit: 200 })
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, rowId, refreshKey, reloadKey]);

  return (
    <aside className="surface-card flex h-full w-full flex-col overflow-hidden">
      <div className="card-head">
        <h3 className="card-title">변경 내역</h3>
        <button onClick={load} className="btn btn-default">
          새로고침
        </button>
        <button onClick={onClose} className="icon-btn ml-auto text-ui-lg leading-none">
          ×
        </button>
      </div>

      {rowId !== undefined && (
        <div className="surface-sub hairline flex items-center gap-2 border-b px-4 py-2 text-ui-xs">
          <span className="fg-muted">행 필터:</span>
          <span className="fg-base min-w-0 truncate font-medium">{rowLabel || `#${rowId}`}</span>
          <button onClick={onClearRowFilter} className="link-quiet ml-auto shrink-0">
            전체 보기
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="empty-state">불러오는 중...</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">기록된 변경이 없습니다</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-2.5 text-ui-sm">
                <div className="flex items-baseline gap-1.5">
                  <span className="fg-base font-medium">{e.actor_name || "알 수 없음"}</span>
                  <span className="fg-subtle text-ui-xs tabular-nums">{formatTime(e.created_at)}</span>
                </div>
                <div className="fg-base mt-1">
                  {e.action === "create" && (
                    <>
                      <span className="chip mr-1"><span className="dot bg-brand-500" />행 추가</span>
                      <span className="font-medium">{e.row_label || `#${e.row_id}`}</span>
                    </>
                  )}
                  {e.action === "delete" && (
                    <>
                      <span className="chip mr-1"><span className="dot bg-error-500" />행 삭제</span>
                      <span className="font-medium">{e.row_label || `#${e.row_id}`}</span>
                    </>
                  )}
                  {e.action === "update" && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="fg-strong font-medium">{e.row_label || `#${e.row_id}`}</span>
                      <span className="fg-subtle">·</span>
                      <span className="fg-base font-medium">{FIELD_LABEL[e.field || ""] || e.field}</span>
                      <Value text={e.old_value} tone="old" />
                      <span className="fg-subtle">→</span>
                      <Value text={e.new_value} tone="new" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
