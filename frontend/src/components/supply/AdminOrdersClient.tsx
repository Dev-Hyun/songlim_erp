"use client";

import { useEffect, useMemo, useState } from "react";
import { localISODate } from "@/lib/date";
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
// 상태는 배경 전체를 칠하지 않고 중성 칩 + 작은 색 점으로만 구분한다.
const STATUS_DOT: Record<string, string> = {
  접수: "bg-gray-400 dark:bg-gray-500",
  출고: "bg-warning-500",
  배송완료: "bg-success-500",
  직납출고: "bg-brand-500",
  직납완료: "bg-success-500",
};
const inputCls = "field";

type DatePreset = "3일" | "1일" | "1주일" | "기간";

function isoDate(d: Date) {
  return localISODate(d);
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

  if (loading && orders.length === 0) return <div className="empty-state">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
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
            <div className="surface-card absolute left-0 top-full z-10 mt-1 max-h-56 w-56 overflow-y-auto shadow-lg">
              <button
                onClick={() => { setHospitalId(""); setHospitalSearch(""); }}
                className="row-hover fg-base block w-full px-3 py-1.5 text-left text-ui"
              >
                전체 병원
              </button>
              {filteredHospitals.map((h) => (
                <button
                  key={h.id}
                  onClick={() => { setHospitalId(String(h.id)); setHospitalSearch(h.hospital_name); }}
                  className={`row-hover fg-base block w-full px-3 py-1.5 text-left text-ui ${hospitalId === String(h.id) ? "fg-strong font-medium" : ""}`}
                >
                  {h.hospital_name}
                </button>
              ))}
              {filteredHospitals.length === 0 && <div className="px-3 py-2 fg-subtle text-ui-sm">검색 결과 없음</div>}
            </div>
          )}
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">전체 상태</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="seg">
          {(["1일", "3일", "1주일", "기간"] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`seg-item ${preset === p ? "seg-item-on" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
        {preset === "기간" && (
          <>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
            <span className="fg-subtle text-ui-sm">~</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={printSelected} className="btn btn-primary">
              🖨 선택 {selected.size}건 묶어서 출력
            </button>
          )}
          <div className="seg">
            <button onClick={() => setView("list")} className={`seg-item ${view === "list" ? "seg-item-on" : ""}`}>목록형</button>
            <button onClick={() => setView("kanban")} className={`seg-item ${view === "kanban" ? "seg-item-on" : ""}`}>칸반형</button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="surface-card overflow-hidden">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => setDetailId(o.id)}
              className="list-row"
            >
              <input type="checkbox" checked={selected.has(o.id)} onClick={(e) => toggleSelect(o.id, e)} onChange={() => {}} className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="fg-strong text-ui font-medium">{o.hospital_name}</div>
                <div className="fg-subtle text-ui-sm">{o.created_at?.replace("T", " ").slice(0, 16)} · {o.items.length}개 품목 · {o.total_amount.toLocaleString()}원</div>
              </div>
              <span className="chip"><span className={`dot ${STATUS_DOT[o.status] || "bg-gray-400"}`} />{o.status}</span>
            </button>
          ))}
          {orders.length === 0 && <div className="empty-state">발주 내역이 없습니다</div>}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3 overflow-x-auto pb-2 max-lg:flex max-lg:grid-cols-none">
          {STATUSES.map((s) => (
            <div key={s} className="surface-sub hairline rounded-card border p-2 max-lg:w-[220px] max-lg:shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="fg-base text-ui font-medium">{s}</span>
                <span className="fg-subtle text-ui-xs">{orders.filter((o) => o.status === s).length}</span>
              </div>
              <div className="space-y-2">
                {orders.filter((o) => o.status === s).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setDetailId(o.id)}
                    className="surface-card block w-full p-2.5 text-left text-ui transition-colors hover:border-gray-300 dark:hover:border-gray-700"
                  >
                    <div className="fg-strong truncate font-medium">{o.hospital_name}</div>
                    <div className="mt-0.5 fg-subtle text-ui-xs tabular-nums">{o.created_at?.slice(0, 10)}</div>
                    <div className="fg-base mt-1 font-medium tabular-nums">{o.total_amount.toLocaleString()}원</div>
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
          <div className="surface-card flex max-h-full w-full max-w-2xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="card-head justify-between">
              <div>
                <div className="card-title">{detail.hospital_name}</div>
                <div className="fg-subtle text-ui-sm">{detail.created_at?.replace("T", " ").slice(0, 16)}</div>
              </div>
              <button onClick={() => setDetailId(null)} className="icon-btn">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="fg-subtle text-ui-sm">진행상태</span>
                <select value={detail.status} onChange={(e) => setOrderStatus(detail.id, e.target.value)} className={inputCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {detail.order_request && (
                <div className="surface-sub hairline mb-3 rounded-control border p-3">
                  <div className="label-eyebrow">📌 병원 요청사항</div>
                  <div className="fg-strong mt-1 whitespace-pre-wrap text-ui-lg font-medium">{detail.order_request}</div>
                </div>
              )}
              <div className="overflow-x-auto">
              <table className="table-cards table-dense min-w-[560px]">
                <thead>
                  <tr>
                    <th className="label-eyebrow py-1.5 text-left">품목</th>
                    <th className="label-eyebrow py-1.5 pl-3 text-left">제조사</th>
                    <th className="label-eyebrow py-1.5 pl-3 text-left">규격</th>
                    <th className="label-eyebrow py-1.5 pl-3 text-left">단위</th>
                    <th className="label-eyebrow py-1.5 text-right">수량</th>
                    <th className="label-eyebrow py-1.5 text-right">단가</th>
                    <th className="label-eyebrow py-1.5 text-right">소계</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id} className="hairline-soft border-b">
                      <td data-label="품목" className="fg-base py-1.5 font-medium">{it.name}</td>
                      <td data-label="제조사" className="fg-muted py-1.5 pl-3">{it.manufacturer || "-"}</td>
                      <td data-label="규격" className="fg-muted py-1.5 pl-3">{it.spec || "-"}</td>
                      <td data-label="단위" className="fg-muted py-1.5 pl-3">{it.unit}</td>
                      <td data-label="수량" className="fg-base py-1.5 text-right tabular-nums">{it.qty}</td>
                      <td data-label="단가" className="fg-base py-1.5 text-right tabular-nums">{it.unit_price.toLocaleString()}원</td>
                      <td data-label="소계" className="fg-strong py-1.5 text-right font-medium tabular-nums">{it.subtotal.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="fg-strong mt-3 text-right text-ui font-medium tabular-nums">합계 {detail.total_amount.toLocaleString()}원</div>

              <div className="hairline mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                <input
                  defaultValue={detail.tracking_number || ""}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="송장번호 입력"
                  className={inputCls}
                />
                <button onClick={() => saveTracking(detail.id)} className="btn btn-primary">송장 저장</button>
                <span className="ml-2 fg-subtle text-ui-xs">세금계산서:</span>
                <select value={detail.tax_invoice_status} onChange={(e) => setTaxStatus(detail.id, e.target.value)} className={inputCls}>
                  <option value="미발행">미발행</option>
                  <option value="발행요청">발행요청</option>
                  <option value="발행완료">발행완료</option>
                </select>
                <button
                  onClick={() => printOrder(detail, detail.hospital_name)}
                  className="btn btn-default ml-auto"
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
