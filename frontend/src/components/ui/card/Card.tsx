import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** 최상위 카드 표면. 다크에서 반투명을 쓰지 않기 위해 surface-card만 사용한다. */
export const Card: React.FC<CardProps> = ({ children, className = "" }) => (
  <div className={`surface-card ${className}`}>{children}</div>
);

interface CardHeaderProps {
  title: React.ReactNode;
  /** 제목 옆 보조 수치(예: 건수) */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  meta,
  actions,
  className = "",
}) => (
  <div className={`card-head ${className}`}>
    <div className="flex min-w-0 items-baseline gap-2">
      <h2 className="card-title truncate">{title}</h2>
      {meta && <span className="fg-subtle shrink-0 text-ui-sm">{meta}</span>}
    </div>
    {actions && (
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
    )}
  </div>
);

export default Card;
