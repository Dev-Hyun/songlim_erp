"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminHospital,
  SupplyOrder,
  adminFetchHospitals,
  adminFetchOrders,
  adminSetOrderStatus,
  adminSetTaxInvoiceStatus,
  adminSetTracking,
} from "./api";
import { printOrder, printOrders } from "./print";

const STATUSES = ["접수", "출고", "배송완료", "직납출고", "직납완료"];
const STATUS_COLOR: Record<string, string> = {
  접수: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  출고: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  배송완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  직납출고: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  직납완료: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
};
const inputCls = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900";

type DatePreset = "3일" | "1일" | "1주일" | "기간";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AdminOrdersClient() {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [hospitals, setHospitals] = useState<AdminHospital[]>([]);
  const [status, setStatus] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [showHospitalOptions, setShowHospitalOptions] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("3일");
  const [dateFrom, setDateFrom] = useState(isoDate(new Date(Date.now() - 2 * 86400000)));
  const [dateTo, setDateTo] = useState(isoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  useEffect(() => {
    adminFetchHospitals().then(setHospitals);
  }, []);

  function applyPreset(p: DatePreset) {
    setPreset(p);
    const today = new Date();
    if (p === "1일") {
      setDateFrom(isoDate(today));
      setDateTo(isoDate(today));
    } else if (p === "3일") {
      setDateFrom(isoDate(new Date(Date.now() - 2 * 86400000)));
      setDateTo(isoDate(today));
    } else if (p === "1주일") {
      setDateFrom(isoDate(new Date(Date.now() - 6 * 86400000)));
      setDateTo(isoDate(today));
    }
  }

  function load() {
    setLoading(true);
    adminFetchOrders({
      status: status || undefined,
      hospital_profile_id: hospitalId ? Number(hospitalId) : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo ? `${dateTo} 23:59:59` : undefined,
    })
      .then(setOrders)
      .finally(() => setLoading(false));
  }
  useEffect(load, [status, hospitalId, dateFrom, dateTo]);

  const filteredHospitals = useMemo(
    () => hospitals.filter((h) => !hospitalSearch || h.hospital_name.includes(hospitalSearch)),
    [hospitals, hospitalSearch]
  );

  const detail = orders.find((o) => o.id === detailId) || null;

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

  function toggleSelect(id: number, e?: React.MouseEvent) {
    e?.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function printSelected() {
    const picked = orders.filter((o) => selected.has(o.id));
    if (picked.length === 0) return;
    printOrders(picked);
  }

  if (loading && orders.length === 0) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="relative">
          <input
            value={hospitalSearch}
            onChange={(e) => { setHospitalSearch(e.target.value); setShowHospitalOptions(true); }}
            onFocus={() => setShowHospitalOptions(true)}
            onBlur={() => setTimeout(() => setShowHospitalOptions(false), 150)}
            placeholder="🔍 병원명 검색"
            className={inputCls + " w-48"}
          />
          {showHospitalOptions && (
            <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <button
                onClick={() => { setHospitalId(""); setHospitalSearch(""); }}
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-white/5"
              >
                전체 병원
              </button>
              {filteredHospitals.map((h) => (
                <button
                  key={h.id}
                  onClick={() => { setHospitalId(String(h.id)); setHospitalSearch(h.hospital_name); }}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-white/5 ${hospitalId === String(h.id) ? "font-bold text-brand-500" : ""}`}
                >
                  {h.hospital_name}
                </button>
              ))}
              {filteredHospitals.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>}
            </div>
          )}
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">전체 상태</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {(["1일", "3일", "1주일", "기간"] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${preset === p ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              {p}
            </button>
          ))}
        </div>
        {preset === "기간" && (
          <>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
            <span className="text-xs text-gray-400">~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={printSelected} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">
              🖨 선택 {selected.size}건 묶어서 출력
            </button>
          )}
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
            <button onClick={() => setView("list")} className={`rounded-full px-3 py-1 text-xs font-bold ${view === "list" ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}>목록형</button>
            <button onClick={() => setView("kanban")} className={`rounded-full px-3 py-1 text-xs font-bold ${view === "kanban" ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}>칸반형</button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => setDetailId(o.id)}
              className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.02]"
            >
              <input type="checkbox" checked={selected.has(o.id)} onClick={(e) => toggleSelect(o.id, e)} onChange={() => {}} className="h-4 w-4" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{o.hospital_name}</div>
                <div className="text-xs text-gray-400">{o.created_at?.replace("T", " ").slice(0, 16)} · {o.items.length}개 품목 · {o.total_amount.toLocaleString()}원</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLOR[o.status] || ""}`}>{o.status}</span>
            </button>
          ))}
          {orders.length === 0 && <div className="p-8 text-center text-sm text-gray-400">발주 내역이 없습니다</div>}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3 overflow-x-auto pb-2 max-lg:flex max-lg:grid-cols-none">
          {STATUSES.map((s) => (
            <div key={s} className="rounded-2xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-white/[0.02] max-lg:w-[220px] max-lg:shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{s}</span>
                <span className="text-[11px] text-gray-400">{orders.filter((o) => o.status === s).length}</span>
              </div>
              <div className="space-y-2">
                {orders.filter((o) => o.status === s).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setDetailId(o.id)}
                    className="block w-full rounded-xl border border-gray-200 bg-white p-2.5 text-left text-xs shadow-sm hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="truncate font-semibold text-gray-800 dark:text-white/90">{o.hospital_name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">{o.created_at?.slice(0, 10)}</div>
                    <div className="mt-1 font-bold text-gray-700 dark:text-gray-200">{o.total_amount.toLocaleString()}원</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상세 팝업 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 sm:p-8" onClick={() => setDetailId(null)}>
          <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <div>
                <div className="text-sm font-bold text-gray-800 dark:text-white/90">{detail.hospital_name}</div>
                <div className="text-xs text-gray-400">{detail.created_at?.replace("T", " ").slice(0, 16)}</div>
              </div>
              <button onClick={() => setDetailId(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-sm text-gray-500 dark:border-gray-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs text-gray-400">진행상태</span>
                <select value={detail.status} onChange={(e) => setOrderStatus(detail.id, e.target.value)} className={inputCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-400 dark:border-gray-800">
                    <th className="py-1.5">품목</th>
                    <th className="py-1.5 pl-3">제조사</th>
                    <th className="py-1.5 pl-3">규격</th>
                    <th className="py-1.5 pl-3">단위</th>
                    <th className="py-1.5 text-right">수량</th>
                    <th className="py-1.5 text-right">단가</th>
                    <th className="py-1.5 text-right">소계</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-1.5 font-medium text-gray-700 dark:text-gray-200">{it.name}</td>
                      <td className="py-1.5 pl-3 text-gray-500">{it.manufacturer || "-"}</td>
                      <td className="py-1.5 pl-3 text-gray-500">{it.spec || "-"}</td>
                      <td className="py-1.5 pl-3 text-gray-500">{it.unit}</td>
                      <td className="py-1.5 text-right">{it.qty}</td>
                      <td className="py-1.5 text-right">{it.unit_price.toLocaleString()}원</td>
                      <td className="py-1.5 text-right font-semibold">{it.subtotal.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="mt-3 text-right text-sm font-bold text-gray-800 dark:text-white/90">합계 {detail.total_amount.toLocaleString()}원</div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                <input
                  defaultValue={detail.tracking_number || ""}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="송장번호 입력"
                  className={inputCls}
                />
                <button onClick={() => saveTracking(detail.id)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">송장 저장</button>
                <span className="ml-2 text-[11px] text-gray-400">세금계산서:</span>
                <select value={detail.tax_invoice_status} onChange={(e) => setTaxStatus(detail.id, e.target.value)} className={inputCls}>
                  <option value="미발행">미발행</option>
                  <option value="발행요청">발행요청</option>
                  <option value="발행완료">발행완료</option>
                </select>
                <button
                  onClick={() => printOrder(detail, detail.hospital_name)}
                  className="ml-auto rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  🖨 발주서 출력
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
