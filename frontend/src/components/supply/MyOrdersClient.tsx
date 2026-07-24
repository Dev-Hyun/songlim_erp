"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SupplyOrder, fetchMyOrders } from "./api";
import { printOrder } from "./print";

const STATUS_COLOR: Record<string, string> = {
  접수: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  출고: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  배송완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  직납출고: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  직납완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
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
      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <div className="text-xs font-semibold text-gray-400">누적 발주 건수</div>
          <div className="mt-1 text-2xl font-extrabold text-gray-800 dark:text-white">{orders.length}건</div>
        </div>
        <button onClick={() => router.push("/supply")} className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
          + 새 발주하기
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900">
          <option value="">전체 상태</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900" />
        <span className="text-xs text-gray-400">~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">발주 내역이 없습니다</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              <button
                onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                    발주 #{o.id}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[o.status]}`}>{o.status}</span>
                    {o.tracking_number && <span className="text-[11px] font-normal text-gray-400">송장 {o.tracking_number}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">{o.created_at?.slice(0, 10)} · {o.items.length}개 품목</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-800 dark:text-white/90">{o.total_amount.toLocaleString()}원</div>
                  <div className="text-[11px] text-gray-400">세금계산서: {o.tax_invoice_status}</div>
                </div>
              </button>
              {expanded === o.id && (
                <div className="bg-gray-50 px-4 pb-4 dark:bg-white/[0.015]">
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="py-1.5">품목</th>
                        <th className="py-1.5">제조사</th>
                        <th className="py-1.5">규격</th>
                        <th className="py-1.5">단위</th>
                        <th className="py-1.5 text-right">단가</th>
                        <th className="py-1.5 text-right">수량</th>
                        <th className="py-1.5 text-right">소계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((it) => (
                        <tr key={it.id} className="border-t border-gray-200 dark:border-gray-800">
                          <td className="py-1.5 font-medium text-gray-700 dark:text-gray-200">{it.name}</td>
                          <td className="py-1.5 text-gray-500">{it.manufacturer || "-"}</td>
                          <td className="py-1.5 text-gray-500">{it.spec || "-"}</td>
                          <td className="py-1.5 text-gray-500">{it.unit}</td>
                          <td className="py-1.5 text-right">{it.unit_price.toLocaleString()}원</td>
                          <td className="py-1.5 text-right">{it.qty}</td>
                          <td className="py-1.5 text-right font-semibold">{it.subtotal.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {o.order_request && (
                    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
                      <div className="text-[11px] font-bold text-brand-600 dark:text-brand-400">요청사항</div>
                      <div className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-gray-800 dark:text-white/90">{o.order_request}</div>
                    </div>
                  )}
                  {o.gift_note && <div className="mt-2 text-[11px] text-success-600 dark:text-success-400">🎁 {o.gift_note}</div>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => router.push(`/supply?reorder=${o.id}`)}
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
                    >
                      ↻ 이 내역으로 재주문
                    </button>
                    <button
                      onClick={() => printOrder(o)}
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
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
