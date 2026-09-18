import React from "react";

interface PageHeaderProps {
  pageTitle: string;
  /** 제목 아래 한 줄 설명(선택) */
  description?: React.ReactNode;
  /** 우측 정렬 액션 영역(선택) */
  actions?: React.ReactNode;
}

/**
 * 페이지 최상단 헤더. 34개 라우트가 공유한다.
 * 밀도형 기준: 제목 18px/semibold, 아래 여백 16px(기존 24px), 얇은 구분선으로
 * 본문과 분리한다. 기존의 "Home >" 브레드크럼은 정보량이 없어 제거하고
 * 대신 설명/액션 슬롯을 둔다.
 */
const PageBreadcrumb: React.FC<PageHeaderProps> = ({
  pageTitle,
  description,
  actions,
}) => {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
      <div className="min-w-0">
        <h1 className="page-title truncate">{pageTitle}</h1>
        {description && (
          <p className="fg-muted mt-1 text-ui">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
};

export default PageBreadcrumb;
