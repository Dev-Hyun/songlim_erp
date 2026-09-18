"use client";

import { useTheme } from "@/context/ThemeContext";

/**
 * 차트 팔레트 — dataviz 검증 스크립트(scripts/validate_palette.js)로 두 모드 모두 통과시킨 값.
 *  light (surface #ffffff): 인접쌍 CVD ΔE 9.1 / 정상시야 ΔE 19.6 — 대비 3:1 미만 슬롯이 있어
 *  차트 옆에 항상 표(table view)를 같이 두는 것으로 완화한다.
 *  dark  (surface #111827): 전 슬롯 대비 3:1 이상.
 */
export const SERIES_LIGHT = ["#465fff", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const SERIES_DARK = ["#6b86ff", "#d95926", "#199e70", "#c98500", "#d55181"];

export function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    dark,
    series: dark ? SERIES_DARK : SERIES_LIGHT,
    ink: dark ? "#c3c2b7" : "#52514e",
    grid: dark ? "#2c2c2a" : "#e1e0d9",
    /** 축/그리드/툴팁만 담당하는 공통 옵션 조각 */
    base: {
      chart: { toolbar: { show: false }, fontFamily: "Outfit, sans-serif", background: "transparent" },
      grid: { borderColor: dark ? "#2c2c2a" : "#e1e0d9", strokeDashArray: 0 },
      tooltip: { theme: dark ? "dark" : "light" },
      dataLabels: { enabled: false },
      legend: { labels: { colors: dark ? "#c3c2b7" : "#52514e" } },
    },
    axisLabel: { style: { colors: dark ? "#c3c2b7" : "#52514e", fontSize: "12px" } },
  };
}

export const selectClass = "field-lg";

export const inputClass = "field-lg";

/** 최상위 카드 — 다크모드에서 반투명 대신 불투명 gray-900을 쓴다 (프로젝트 규약). */
export function Panel({
  title,
  desc,
  right,
  children,
  className = "",
}: {
  title?: string;
  desc?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`surface-card p-4 ${className}`}
    >
      {(title || right) && (
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <h3 className="card-title truncate">{title}</h3>}
            {desc && <p className="fg-muted mt-0.5 text-ui-sm">{desc}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
}) {
  return (
    <div className="surface-card p-4">
      <div className="label-eyebrow">{label}</div>
      <div className="fg-strong mt-1 text-ui-2xl font-semibold tabular-nums tracking-[-0.01em]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="fg-muted mt-1 text-ui-sm">{sub}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "btn btn-default";
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className="fg-muted text-ui-sm tabular-nums">
        {total.toLocaleString()}건 중 {from.toLocaleString()}–{to.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button className={btn} disabled={page <= 1} onClick={() => onChange(1)}>
          처음
        </button>
        <button className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          이전
        </button>
        <span className="fg-base px-2 text-ui font-medium tabular-nums">
          {page} / {last}
        </span>
        <button className={btn} disabled={page >= last} onClick={() => onChange(page + 1)}>
          다음
        </button>
        <button className={btn} disabled={page >= last} onClick={() => onChange(last)}>
          마지막
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="empty-state">{message}</p>;
}
