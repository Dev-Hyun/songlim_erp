"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SupplyOrder, fetchMyOrders } from "./api";
import { printOrder } from "./print";

// 상태는 배경 전체를 칠하지 않고 중성 칩 + 작은 색 점으로만 구분한다.
const STATUS_DOT: Record<string, string> = {
  접수: "bg-gray-400 dark:bg-gray-500",
  출고: "bg-warning-500",
  배송완료: "bg-success-500",
  직납출고: "bg-brand-500",
  직납완료: "bg-success-500",
};
const STATUSES = ["접수", "출고", "배송완료", "직납출고", "직납완료"];

export default function MyOrdersClient() {
  const router = useRouter();
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetchMyOrders({ status: status || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined })
      .then(setOrders)
      .finally(() => setLoading(false));
  }

  useEffect(load, [status, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="surface-card flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="label-eyebrow">누적 발주 건수</div>
          <div className="fg-strong mt-1 text-ui-2xl font-semibold tabular-nums">{orders.length}건</div>
        </div>
        <button onClick={() => router.push("/supply")} className="btn btn-primary">
          + 새 발주하기
        </button>
      </div>

      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field">
          <option value="">전체 상태</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="field" />
        <span className="fg-subtle text-ui-sm">~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="field" />
      </div>

      <div className="surface-card overflow-hidden">
        {loading ? (
          <div className="empty-state">불러오는 중...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">발주 내역이 없습니다</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="hairline-soft border-b last:border-0">
              <button
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                className="row-hover flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <div>
                  <div className="flex items-center gap-2 fg-strong text-ui font-medium">
                    발주 #{o.id}
                    <span className="chip"><span className={`dot ${STATUS_DOT[o.status] || "bg-gray-400"}`} />{o.status}</span>
                    {o.tracking_number && <span className="fg-subtle text-ui-xs font-normal">송장 {o.tracking_number}</span>}
                  </div>
                  <div className="mt-0.5 fg-subtle text-ui-sm">{o.created_at?.slice(0, 10)} · {o.items.length}개 품목</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="fg-strong text-ui font-medium tabular-nums">{o.total_amount.toLocaleString()}원</div>
                  <div className="fg-subtle text-ui-xs">세금계산서: {o.tax_invoice_status}</div>
                </div>
              </button>
              {expanded === o.id && (
                <div className="surface-sub px-3 pb-3">
                  <div className="overflow-x-auto">
                  <table className="table-cards table-dense min-w-[520px]">
                    <thead>
                      <tr>
                        <th className="label-eyebrow py-1.5 text-left">품목</th>
                        <th className="label-eyebrow py-1.5 text-left">제조사</th>
                        <th className="label-eyebrow py-1.5 text-left">규격</th>
                        <th className="label-eyebrow py-1.5 text-left">단위</th>
                        <th className="label-eyebrow py-1.5 text-right">단가</th>
                        <th className="label-eyebrow py-1.5 text-right">수량</th>
                        <th className="label-eyebrow py-1.5 text-right">소계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((it) => (
                        <tr key={it.id} className="hairline border-t">
                          <td data-label="품목" className="fg-base py-1.5 pr-3 font-medium">{it.name}</td>
                          <td data-label="제조사" className="fg-muted py-1.5 pr-3">{it.manufacturer || "-"}</td>
                          <td data-label="규격" className="fg-muted py-1.5 pr-3">{it.spec || "-"}</td>
                          <td data-label="단위" className="fg-muted py-1.5 pr-3">{it.unit}</td>
                          <td data-label="단가" className="fg-base py-1.5 text-right tabular-nums">{it.unit_price.toLocaleString()}원</td>
                          <td data-label="수량" className="fg-base py-1.5 text-right tabular-nums">{it.qty}</td>
                          <td data-label="소계" className="fg-strong py-1.5 text-right font-medium tabular-nums">{it.subtotal.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {o.order_request && (
                    <div className="surface-card mt-3 p-2.5">
                      <div className="label-eyebrow">요청사항</div>
                      <div className="fg-strong mt-0.5 whitespace-pre-wrap text-ui font-medium">{o.order_request}</div>
                    </div>
                  )}
                  {o.gift_note && <div className="mt-2 text-ui-xs text-success-600 dark:text-success-400">🎁 {o.gift_note}</div>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => router.push(`/supply?reorder=${o.id}`)}
                      className="btn btn-default"
                    >
                      ↻ 이 내역으로 재주문
                    </button>
                    <button
                      onClick={() => printOrder(o)}
                      className="btn btn-default"
                    >
                      🖨 발주서 출력
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
