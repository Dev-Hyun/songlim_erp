import React from "react";

export type StatusTone = "neutral" | "progress" | "success" | "danger" | "info";

const DOT: Record<StatusTone, string> = {
  neutral: "bg-gray-400 dark:bg-gray-500",
  progress: "bg-warning-500",
  success: "bg-success-500",
  danger: "bg-error-500",
  info: "bg-brand-500",
};

/**
 * 상태 배지. 배경 전체를 색으로 칠하지 않고 중성 칩 + 작은 색 점으로 표시한다.
 * 목록에 배지가 수십 개 늘어서도 화면이 알록달록해지지 않고, 상태 구분은 유지된다.
 */
const StatusBadge: React.FC<{
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = "neutral", children, className = "" }) => (
  <span className={`chip ${className}`}>
    <span className={`dot ${DOT[tone]}`} />
    {children}
  </span>
);

export default StatusBadge;
