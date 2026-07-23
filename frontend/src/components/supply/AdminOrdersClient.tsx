"use client";

import { useEffect, useState } from "react";
import {
  AdminHospital,
  SupplyOrder,
  adminFetchHospitals,
  adminFetchOrders,
  adminSetOrderStatus,
  adminSetTaxInvoiceStatus,
  adminSetTracking,
} from "./api";
import { printOrder } from "./print";

const STATUSES = ["접수", "출고", "배송완료", "직납출고", "직납완료"];
const inputCls = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900";

export default function AdminOrdersClient() {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [hospitals, setHospitals] = useState<AdminHospital[]>([]);
  const [status, setStatus] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  useEffect(() => {
    adminFetchHospitals().then(setHospitals);
  }, []);

  function load() {
    setLoading(true);
    adminFetchOrders({
      status: status || undefined,
      hospital_profile_id: hospitalId ? Number(hospitalId) : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then(setOrders)
      .finally(() => setLoading(false));
  }
  useEffect(load, [status, hospitalId, dateFrom, dateTo]);

  async function setOrderStatus(id: number, s: string) {
    await adminSetOrderStatus(id, s);
    load();
  }

  async function saveTracking(id: number) {
    if (!trackingInput) return;
    await adminSetTracking(id, trackingInput);
    setTrackingInput("");
    load();
  }

  async function setTaxStatus(id: number, s: string) {
    await adminSetTaxInvoiceStatus(id, s);
    load();
  }

  if (loading && orders.length === 0) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className={inputCls}>
          <option value="">전체 병원</option>
          {hospitals.map((h) => <option key={h.id} value={h.id}>{h.hospital_name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">전체 상태</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
        <span className="text-xs text-gray-400">~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {orders.map((o) => (
          <div key={o.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
            <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">#{o.id} · {o.hospital_name}</div>
                <div className="text-xs text-gray-400">{o.created_at?.slice(0, 10)} · {o.items.length}개 품목 · {o.total_amount.toLocaleString()}원</div>
              </div>
              <select value={o.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setOrderStatus(o.id, e.target.value)} className={inputCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </button>
            {expanded === o.id && (
              <div className="space-y-3 bg-gray-50 px-4 pb-4 dark:bg-white/[0.015]">
                <table className="w-full text-xs">
                  <tbody>
                    {o.items.map((it) => (
                      <tr key={it.id} className="border-t border-gray-200 dark:border-gray-800">
                        <td className="py-1.5">{it.name}</td>
                        <td className="py-1.5 text-right">{it.qty}{it.unit} × {it.unit_price.toLocaleString()}원</td>
                        <td className="py-1.5 text-right font-semibold">{it.subtotal.toLocaleString()}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    defaultValue={o.tracking_number || ""}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="송장번호 입력"
                    className={inputCls}
                  />
                  <button onClick={() => saveTracking(o.id)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">송장 저장</button>
                  <span className="ml-2 text-[11px] text-gray-400">세금계산서:</span>
                  <select value={o.tax_invoice_status} onChange={(e) => setTaxStatus(o.id, e.target.value)} className={inputCls}>
                    <option value="미발행">미발행</option>
                    <option value="발행요청">발행요청</option>
                    <option value="발행완료">발행완료</option>
                  </select>
                  <button
                    onClick={() => printOrder(o, o.hospital_name)}
                    className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  >
                    🖨 발주서 출력
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && <div className="p-8 text-center text-sm text-gray-400">발주 내역이 없습니다</div>}
      </div>
    </div>
  );
}
