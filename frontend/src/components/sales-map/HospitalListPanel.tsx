"use client";

import { CATEGORY_LABEL, EquipmentCategory, HospitalListItem } from "./types";

interface Props {
  category: EquipmentCategory;
  hospitals: HospitalListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
}

export default function HospitalListPanel({ category, hospitals, selectedId, onSelect, loading }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          병원 <span className="font-semibold text-brand-500">{hospitals.length}</span>개
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />
            ))}
          </div>
        )}
        {!loading && hospitals.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">검색 결과가 없습니다</div>
        )}
        {!loading &&
          hospitals.map((h) => (
            <button
              key={h.id}
              onClick={() => onSelect(h.id)}
              className={`mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition ${
                selectedId === h.id
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                  : h.has_equipment
                  ? "border-gray-200 bg-white hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.02]"
                  : "border-gray-200 bg-gray-50 opacity-80 hover:opacity-100 dark:border-gray-800 dark:bg-white/[0.01]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white/90">
                {h.name}
                {h.is_member && (
                  <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] font-bold text-success-600 dark:bg-success-500/15 dark:text-success-400">
                    회원
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {h.sigungu || ""} · {h.type || ""}
              </div>
              {h.has_equipment ? (
                <div className="mt-1 text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{h.current_model || "-"}</span>
                  <span className="ml-1 text-gray-400">{h.current_maker}</span>
                </div>
              ) : (
                <div className="mt-1 text-xs italic text-gray-400">{CATEGORY_LABEL[category]} 장비 없음</div>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
