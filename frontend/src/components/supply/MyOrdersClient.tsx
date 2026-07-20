"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BalanceInfo, SupplyOrder, fetchMyBalance, fetchMyOrders } from "./api";

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
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      fetchMyOrders({ status: status || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined }),
      fetchMyBalance(),
    ])
      .then(([o, b]) => { setOrders(o); setBalance(b); })
      .finally(() => setLoading(false));
  }

  useEffect(load, [status, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs font-semibold text-gray-400">
            {balance && balance.balance < 0 ? "현재 미수금" : "선납 충전잔액"}
          </div>
          <div className={`mt-1 text-2xl font-extrabold ${balance && balance.balance < 0 ? "text-error-500" : "text-brand-500"}`}>
            {balance ? Math.abs(balance.balance).toLocaleString() : 0}원
          </div>
          <button onClick={() => setShowLedger((v) => !v)} className="mt-2 text-xs font-semibold text-gray-400 hover:text-brand-500">
            {showLedger ? "거래내역 닫기 ▲" : "거래내역 보기 ▼"}
          </button>
          {showLedger && balance && (
            <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto border-t border-gray-100 pt-3 text-xs dark:border-gray-800">
              {balance.entries.map((e) => (
                <div key={e.id} className="flex justify-between">
                  <span className="text-gray-500">{e.created_at?.slice(0, 10)} · {e.memo || (e.entry_type === "topup" ? "선납 충전" : e.entry_type === "order" ? "발주 차감" : "조정")}</span>
                  <span className={e.amount >= 0 ? "font-semibold text-brand-500" : "font-semibold text-error-500"}>
                    {e.amount >= 0 ? "+" : ""}{e.amount.toLocaleString()}원
                  </span>
                </div>
              ))}
              {balance.entries.length === 0 && <div className="text-gray-400">거래내역이 없습니다</div>}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="text-xs font-semibold text-gray-400">누적 발주 건수</div>
          <div className="mt-1 text-2xl font-extrabold text-gray-800 dark:text-white">{orders.length}건</div>
          <button onClick={() => router.push("/supply")} className="mt-3 rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
            + 새 발주하기
          </button>
        </div>
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
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="py-1.5">품목</th>
                        <th className="py-1.5 text-right">단가</th>
                        <th className="py-1.5 text-right">수량</th>
                        <th className="py-1.5 text-right">소계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((it) => (
                        <tr key={it.id} className="border-t border-gray-200 dark:border-gray-800">
                          <td className="py-1.5">{it.name}</td>
                          <td className="py-1.5 text-right">{it.unit_price.toLocaleString()}원</td>
                          <td className="py-1.5 text-right">{it.qty}{it.unit}</td>
                          <td className="py-1.5 text-right font-semibold">{it.subtotal.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {o.gift_note && <div className="mt-2 text-[11px] text-success-600 dark:text-success-400">🎁 {o.gift_note}</div>}
                  <button
                    onClick={() => router.push(`/supply?reorder=${o.id}`)}
                    className="mt-3 rounded-full border border-gray-300 px-3 py-1.5 text-[11px] font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
                  >
                    ↻ 이 내역으로 재주문
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
