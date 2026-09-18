"use client";

import { CATEGORY_LABEL, EquipmentCategory, HospitalListItem } from "./types";

interface Props {
  category: EquipmentCategory;
  hospitals: HospitalListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
  // 지도에서 여러 병원이 겹친 마커를 누르면 그 좌표의 병원만 추려 보여준다
  stackIds?: number[] | null;
  onClearStack?: () => void;
  // 백엔드가 500건에서 잘랐는지 — 잘린 걸 모르면 "병원이 합쳐졌다"고 오해하게 된다
  truncated?: boolean;
}

// 같은 이름의 병원이 여러 곳 있을 때 목록에서 서로 구분되도록 시도+시군구를 함께 보여준다.
// (예: '우리동물병원'은 전국 43곳, '서울동물병원'은 성남시 안에만 2곳)
function regionLabel(h: HospitalListItem) {
  return [h.sido, h.sigungu].filter(Boolean).join(" ");
}

export default function HospitalListPanel({
  category,
  hospitals,
  selectedId,
  onSelect,
  loading,
  stackIds,
  onClearStack,
  truncated,
}: Props) {
  const stacked = stackIds && stackIds.length > 0;
  const visible = stacked ? hospitals.filter((h) => stackIds.includes(h.id)) : hospitals;

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar justify-between">
        <span className="fg-muted text-ui">
          병원 <span className="fg-strong font-semibold tabular-nums">{visible.length}</span>개
        </span>
        {stacked && (
          <button
            onClick={onClearStack}
            className="btn btn-default h-7"
          >
            전체 보기
          </button>
        )}
      </div>

      {stacked && (
        <div className="surface-sub hairline fg-muted border-b px-3 py-2 text-ui-xs">
          같은 위치에 겹쳐 있는 병원 {visible.length}곳입니다
        </div>
      )}

      {!stacked && truncated && (
        <div className="hairline flex items-center gap-1.5 border-b bg-warning-50 px-3 py-2 text-ui-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          결과가 많아 500건까지만 표시했습니다. 검색어나 지역을 좁혀주세요.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1.5">
        {loading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-card bg-gray-100 dark:bg-white/[0.04]" />
            ))}
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div className="empty-state">검색 결과가 없습니다</div>
        )}
        {!loading &&
          visible.map((h) => (
            <button
              key={h.id}
              onClick={() => onSelect(h.id)}
              className={`mb-1 w-full rounded-control border px-2.5 py-2 text-left transition-colors ${
                selectedId === h.id
                  ? "border-gray-900 bg-gray-100 dark:border-white/40 dark:bg-white/[0.08]"
                  : h.has_equipment
                  ? "hairline bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/[0.04]"
                  : "hairline surface-sub opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5 fg-strong text-ui font-medium">
                <span className="min-w-0 truncate">{h.name}</span>
                {h.is_member && (
                  <span className="chip">
                    <span className="dot bg-success-500" />
                    회원
                  </span>
                )}
              </div>
              <div className="mt-0.5 fg-subtle text-ui-sm">
                {regionLabel(h) || "지역 미상"} · {h.type || ""}
              </div>
              {/* 주소는 동일 지역·동일 이름 병원을 구분하는 마지막 단서라 있으면 항상 보여준다 */}
              {h.address && (
                <div className="mt-0.5 line-clamp-2 fg-subtle text-ui-xs">{h.address}</div>
              )}
              {!h.address && !h.lat && (
                <div className="mt-0.5 fg-subtle text-ui-xs">위치 정보 없음 — 지도에 표시되지 않음</div>
              )}
              {h.has_equipment ? (
                <div className="mt-1 text-ui-sm">
                  <span className="fg-base font-medium">{h.current_model || "-"}</span>
                  <span className="fg-subtle ml-1">{h.current_maker}</span>
                </div>
              ) : (
                <div className="fg-subtle mt-1 text-ui-sm">{CATEGORY_LABEL[category]} 장비 없음</div>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
