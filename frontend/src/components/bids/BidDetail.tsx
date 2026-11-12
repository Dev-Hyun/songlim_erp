"use client";

export interface BidFile {
  name: string;
  url: string;
}

export interface BidProduct {
  code: string;
  name: string;
  medical: boolean;
}

export interface BidItem {
  id: number;
  bid_no: string;
  source: string | null;
  title: string;
  agency: string | null;
  budget: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  files?: BidFile[] | null;
  days_left: number | null;
  expires_soon: boolean;
  categories: string[];
  items: string | null;
  notice_date: string | null;
  budget_amount: number | null;
  notice_kind: string | null;
  /** 나라장터 공고만 있다. info = [이름, 값] 순서대로 */
  detail: { info: [string, string][]; products: BidProduct[] } | null;
}

const EXT_COLORS: Record<string, string> = {
  hwp: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  hwpx: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  doc: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  docx: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  pdf: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  xls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  xlsx: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  ppt: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  pptx: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  zip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return "FILE";
  return name.slice(i + 1).toUpperCase().slice(0, 4);
}

/** 펼친 공고 상세 — 입찰정보(공고·기관·방식·금액·일정·담당자), 구매대상물품, 첨부파일 */
export default function BidDetail({ bid }: { bid: BidItem }) {
  const files = bid.files || [];
  const info = bid.detail?.info ?? [
    ["수요기관", bid.agency || "-"],
    ["추정가격", bid.budget || "미정"],
    ["공고일", bid.start_date || "미정"],
    ["마감일", bid.end_date || "미정"],
  ];
  const products = bid.detail?.products ?? [];

  return (
    <div className="space-y-4">
      <section>
        <h4 className="label-eyebrow mb-2">입찰정보</h4>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k} className="flex min-w-0 gap-2 text-ui-sm">
              <dt className="fg-muted w-28 shrink-0">{k}</dt>
              <dd className="fg-base min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {products.length > 0 && (
        <section>
          <h4 className="label-eyebrow mb-2">구매대상물품 ({products.length})</h4>
          <ul className="flex flex-wrap gap-1.5">
            {products.map((p) => (
              <li
                key={`${p.code}-${p.name}`}
                className={p.medical ? "chip" : "chip-quiet"}
                title={`물품분류번호 ${p.code}${p.medical ? " · 의료장비로 분류" : ""}`}
              >
                {p.medical && <span className="dot bg-brand-500" />}
                {p.name}
                <span className="fg-subtle tabular-nums">{p.code}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="label-eyebrow mb-2">첨부파일{files.length > 0 ? ` (${files.length})` : ""}</h4>
        {files.length === 0 ? (
          <p className="fg-subtle text-ui-sm">첨부파일 없음 — 원문에서 확인하세요</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {files.map((f, i) => (
              <a
                key={`${f.url}-${i}`}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                title={f.name}
                className="flex min-w-0 items-center gap-2 rounded-control border border-gray-200 bg-white px-3 py-2 hover:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    EXT_COLORS[fileExt(f.name).toLowerCase()] ||
                    "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {fileExt(f.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-200">{f.name}</span>
                <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 3a1 1 0 011 1v6.6l2.3-2.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L9 10.6V4a1 1 0 011-1z" />
                  <path d="M4 15a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" />
                </svg>
              </a>
            ))}
          </div>
        )}
      </section>

      {bid.url && (
        <a href={bid.url} target="_blank" rel="noreferrer" className="btn btn-default">
          {bid.source === "D2B" ? "국방전자조달 원문 보기 ↗" : "나라장터 원문 보기 ↗"}
        </a>
      )}
    </div>
  );
}
