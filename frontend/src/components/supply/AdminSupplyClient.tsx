"use client";

import { useEffect, useState } from "react";
import {
  AdminCatalogItem,
  AdminHospital,
  CategoryAccessRow,
  GradeRow,
  PriceOverride,
  SupplyOrder,
  adminAddCategoryAccess,
  adminAdjustBalance,
  adminCreateCatalog,
  adminDeleteCatalog,
  adminDeletePriceOverride,
  adminFetchCatalog,
  adminFetchCategoryAccess,
  adminFetchHospitals,
  adminFetchOrders,
  adminFetchPriceOverrides,
  adminRemoveCategoryAccess,
  adminSetHospitalGrades,
  adminSetOrderStatus,
  adminSetTaxInvoiceStatus,
  adminSetTracking,
  adminUpdateCatalog,
  adminUpsertPriceOverride,
  fetchGrades,
} from "./api";

type Tab = "catalog" | "hospitals" | "orders";
const STATUSES = ["접수", "출고", "배송완료", "직납출고", "직납완료"];
const HOSPITAL_TYPES = ["의원", "병원", "대학병원", "동물병원"];

const inputCls = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900";

export default function AdminSupplyClient() {
  const [tab, setTab] = useState<Tab>("catalog");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]" style={{ width: "fit-content" }}>
        {[
          { v: "catalog", l: "카탈로그 관리" },
          { v: "hospitals", l: "병원 관리" },
          { v: "orders", l: "발주 관리" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as Tab)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${tab === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            {t.l}
          </button>
        ))}
      </div>
      {tab === "catalog" && <CatalogTab />}
      {tab === "hospitals" && <HospitalsTab />}
      {tab === "orders" && <OrdersTab />}
    </div>
  );
}

function CatalogTab() {
  const [items, setItems] = useState<AdminCatalogItem[]>([]);
  const [access, setAccess] = useState<CategoryAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", spec: "", category: "소모품", unit: "개", unit_price: "" });
  const [accessForm, setAccessForm] = useState({ category: "", hospital_type: "동물병원" });

  function load() {
    setLoading(true);
    Promise.all([adminFetchCatalog(), adminFetchCategoryAccess()])
      .then(([c, a]) => { setItems(c); setAccess(a); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createItem() {
    if (!form.name || !form.unit_price) return;
    await adminCreateCatalog({ ...form, unit_price: Number(form.unit_price) });
    setForm({ name: "", spec: "", category: "소모품", unit: "개", unit_price: "" });
    load();
  }

  async function updateField(item: AdminCatalogItem, patch: Partial<AdminCatalogItem>) {
    const updated = { ...item, ...patch };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await adminUpdateCatalog(item.id, {
      name: updated.name, spec: updated.spec || undefined, category: updated.category, unit: updated.unit,
      unit_price: updated.unit_price, description: updated.description || undefined, is_active: updated.is_active,
    });
  }

  async function removeItem(id: number) {
    if (!confirm("이 품목을 삭제하시겠습니까?")) return;
    await adminDeleteCatalog(id);
    load();
  }

  async function addAccess() {
    if (!accessForm.category) return;
    await adminAddCategoryAccess(accessForm);
    setAccessForm({ ...accessForm, category: "" });
    load();
  }

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-sm font-bold text-gray-800 dark:text-white/90">품목 등록</h3>
        <div className="grid grid-cols-5 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="품목명" className={inputCls} />
          <input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="규격(선택)" className={inputCls} />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="카테고리" className={inputCls} />
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="단위" className={inputCls} />
          <div className="flex gap-1">
            <input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="기본금액" className={inputCls} />
            <button onClick={createItem} className="shrink-0 rounded-lg bg-brand-500 px-3 text-xs font-bold text-white">추가</button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
              <th className="px-3 py-2">품목명</th>
              <th className="px-3 py-2">카테고리</th>
              <th className="px-3 py-2">단위</th>
              <th className="px-3 py-2">기본금액</th>
              <th className="px-3 py-2">노출</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="px-3 py-1.5"><input defaultValue={it.name} onBlur={(e) => updateField(it, { name: e.target.value })} className={inputCls + " w-full"} /></td>
                <td className="px-3 py-1.5"><input defaultValue={it.category} onBlur={(e) => updateField(it, { category: e.target.value })} className={inputCls + " w-24"} /></td>
                <td className="px-3 py-1.5"><input defaultValue={it.unit} onBlur={(e) => updateField(it, { unit: e.target.value })} className={inputCls + " w-16"} /></td>
                <td className="px-3 py-1.5"><input type="number" defaultValue={it.unit_price} onBlur={(e) => updateField(it, { unit_price: Number(e.target.value) })} className={inputCls + " w-24"} /></td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => updateField(it, { is_active: !it.is_active })}>{it.is_active ? "✅" : "⬜"}</button>
                </td>
                <td className="px-3 py-1.5 text-center"><button onClick={() => removeItem(it.id)} className="text-error-500">×</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">등록된 품목이 없습니다</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-1 text-sm font-bold text-gray-800 dark:text-white/90">카테고리별 노출 제한</h3>
        <p className="mb-3 text-[11px] text-gray-400">지정한 카테고리는 여기 등록된 병원종별 계정에만 노출됩니다 (예: &quot;동물병원&quot; 카테고리 → 동물병원 계정만).</p>
        <div className="mb-3 flex gap-2">
          <input value={accessForm.category} onChange={(e) => setAccessForm({ ...accessForm, category: e.target.value })} placeholder="카테고리명" className={inputCls} />
          <select value={accessForm.hospital_type} onChange={(e) => setAccessForm({ ...accessForm, hospital_type: e.target.value })} className={inputCls}>
            {HOSPITAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={addAccess} className="rounded-lg bg-brand-500 px-3 text-xs font-bold text-white">허용 추가</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold dark:bg-white/10">
              {a.category} → {a.hospital_type}
              <button onClick={async () => { await adminRemoveCategoryAccess(a.id); load(); }} className="text-error-500">×</button>
            </span>
          ))}
          {access.length === 0 && <span className="text-[11px] text-gray-400">제한된 카테고리가 없습니다 (모두 전체공개)</span>}
        </div>
      </div>
    </div>
  );
}

function HospitalsTab() {
  const [hospitals, setHospitals] = useState<AdminHospital[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [overrides, setOverrides] = useState<PriceOverride[]>([]);
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustMemo, setAdjustMemo] = useState("");
  const [ovForm, setOvForm] = useState({ catalog_id: "", override_price: "" });

  function load() {
    setLoading(true);
    Promise.all([adminFetchHospitals(), fetchGrades(), adminFetchCatalog()])
      .then(([h, g, c]) => { setHospitals(h); setGrades(g); setCatalog(c); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function loadOverrides(hid: number) {
    adminFetchPriceOverrides(hid).then(setOverrides);
  }

  async function setGrade(h: AdminHospital, key: "discount_grade_code" | "gift_grade_code", value: string) {
    const payload = {
      discount_grade_code: key === "discount_grade_code" ? (value || null) : h.discount_grade_code,
      gift_grade_code: key === "gift_grade_code" ? (value || null) : h.gift_grade_code,
    };
    await adminSetHospitalGrades(h.id, payload);
    load();
  }

  async function adjustBalance(h: AdminHospital) {
    if (!adjustAmount) return;
    await adminAdjustBalance(h.id, Number(adjustAmount), adjustMemo || undefined);
    setAdjustAmount("");
    setAdjustMemo("");
    load();
  }

  async function addOverride(h: AdminHospital) {
    if (!ovForm.catalog_id || !ovForm.override_price) return;
    await adminUpsertPriceOverride({ catalog_id: Number(ovForm.catalog_id), hospital_profile_id: h.id, override_price: Number(ovForm.override_price) });
    setOvForm({ catalog_id: "", override_price: "" });
    loadOverrides(h.id);
  }

  const discountGrades = grades.filter((g) => g.grade_type === "discount");
  const giftGrades = grades.filter((g) => g.grade_type === "gift");

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-2">
      {hospitals.map((h) => (
        <div key={h.id} className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            onClick={() => { const next = selected === h.id ? null : h.id; setSelected(next); if (next) loadOverrides(h.id); }}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{h.hospital_name}</span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-white/10">{h.hospital_type}</span>
            </div>
            <span className={`text-xs font-bold ${h.balance < 0 ? "text-error-500" : "text-brand-500"}`}>
              {h.balance < 0 ? "미수금 " : "충전잔액 "}{Math.abs(h.balance).toLocaleString()}원
            </span>
          </button>
          {selected === h.id && (
            <div className="space-y-4 border-t border-gray-100 p-4 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-400">할인 등급</label>
                  <select value={h.discount_grade_code || ""} onChange={(e) => setGrade(h, "discount_grade_code", e.target.value)} className={inputCls + " w-full"}>
                    <option value="">없음</option>
                    {discountGrades.map((g) => <option key={g.grade_code} value={g.grade_code}>{g.label} ({g.discount_rate}%)</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-400">사은품 등급</label>
                  <select value={h.gift_grade_code || ""} onChange={(e) => setGrade(h, "gift_grade_code", e.target.value)} className={inputCls + " w-full"}>
                    <option value="">없음</option>
                    {giftGrades.map((g) => <option key={g.grade_code} value={g.grade_code}>{g.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-400">잔액 조정 (양수=선납충전, 음수=미수금조정)</label>
                <div className="flex gap-2">
                  <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="금액" className={inputCls} />
                  <input value={adjustMemo} onChange={(e) => setAdjustMemo(e.target.value)} placeholder="메모" className={inputCls + " flex-1"} />
                  <button onClick={() => adjustBalance(h)} className="rounded-lg bg-brand-500 px-3 text-xs font-bold text-white">적용</button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-400">품목별 전용 단가</label>
                <div className="mb-2 flex gap-2">
                  <select value={ovForm.catalog_id} onChange={(e) => setOvForm({ ...ovForm, catalog_id: e.target.value })} className={inputCls + " flex-1"}>
                    <option value="">품목 선택</option>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="number" value={ovForm.override_price} onChange={(e) => setOvForm({ ...ovForm, override_price: e.target.value })} placeholder="적용가" className={inputCls} />
                  <button onClick={() => addOverride(h)} className="rounded-lg bg-brand-500 px-3 text-xs font-bold text-white">설정</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {overrides.map((o) => {
                    const c = catalog.find((x) => x.id === o.catalog_id);
                    return (
                      <span key={o.id} className="flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-[11px] font-semibold text-success-600 dark:bg-success-500/15 dark:text-success-400">
                        {c?.name || `#${o.catalog_id}`}: {o.override_price.toLocaleString()}원
                        <button onClick={async () => { await adminDeletePriceOverride(o.id); loadOverrides(h.id); }} className="text-error-500">×</button>
                      </span>
                    );
                  })}
                  {overrides.length === 0 && <span className="text-[11px] text-gray-400">설정된 전용 단가가 없습니다</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {hospitals.length === 0 && <div className="p-8 text-center text-sm text-gray-400">등록된 병원 계정이 없습니다</div>}
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  function load() {
    setLoading(true);
    adminFetchOrders({ status: status || undefined }).then(setOrders).finally(() => setLoading(false));
  }
  useEffect(load, [status]);

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

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">전체 상태</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
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
