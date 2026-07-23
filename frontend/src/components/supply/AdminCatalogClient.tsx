"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdminCatalogItem,
  CategoryAccessRow,
  adminAddCategoryAccess,
  adminCatalogExportUrl,
  adminCreateCatalog,
  adminDeleteCatalog,
  adminFetchCatalog,
  adminFetchCategoryAccess,
  adminImportCatalog,
  adminRemoveCategoryAccess,
  adminUpdateCatalog,
} from "./api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
const HOSPITAL_TYPES = ["의원", "병원", "대학병원", "동물병원"];
const inputCls = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900";

export default function AdminCatalogClient() {
  const [items, setItems] = useState<AdminCatalogItem[]>([]);
  const [access, setAccess] = useState<CategoryAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ name: "", spec: "", category: "소모품", pack_size: "1", unit: "개", unit_price: "" });
  const [accessForm, setAccessForm] = useState({ category: "", hospital_type: "동물병원" });
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function load() {
    setLoading(true);
    Promise.all([adminFetchCatalog(), adminFetchCategoryAccess()])
      .then(([c, a]) => { setItems(c); setAccess(a); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createItem() {
    if (!form.name || !form.unit_price) return;
    await adminCreateCatalog({ ...form, pack_size: Number(form.pack_size) || 1, unit_price: Number(form.unit_price) });
    setForm({ name: "", spec: "", category: "소모품", pack_size: "1", unit: "개", unit_price: "" });
    load();
  }

  async function updateField(item: AdminCatalogItem, patch: Partial<AdminCatalogItem>) {
    const updated = { ...item, ...patch };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await adminUpdateCatalog(item.id, {
      name: updated.name, spec: updated.spec || undefined, category: updated.category,
      pack_size: updated.pack_size, unit: updated.unit,
      unit_price: updated.unit_price, description: updated.description || undefined,
      image_key: updated.image_key || undefined, is_active: updated.is_active,
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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const res = await adminImportCatalog(file);
      alert(`${res.added}건 추가, ${res.skipped}건은 이미 등록된 품목이라 건너뛰었습니다.`);
      load();
    } finally {
      setImporting(false);
    }
  }

  async function handleImageUpload(item: AdminCatalogItem, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/api/uploads/image`, { method: "POST", credentials: "include", body: form });
    if (!res.ok) return;
    const data: { url: string } = await res.json();
    await updateField(item, { image_key: data.url });
  }

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-sm font-bold text-gray-800 dark:text-white/90">품목 등록</h3>
        <div className="grid grid-cols-6 gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="품목명" className={inputCls} />
          <input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="규격(선택)" className={inputCls} />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="카테고리" className={inputCls} />
          <input type="number" value={form.pack_size} onChange={(e) => setForm({ ...form, pack_size: e.target.value })} placeholder="개수단위" className={inputCls} />
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="단위" className={inputCls} />
          <div className="flex gap-1">
            <input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder="기본금액" className={inputCls} />
            <button onClick={createItem} className="shrink-0 rounded-lg bg-brand-500 px-3 text-xs font-bold text-white">추가</button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          개수단위: 예) 100개입 박스 단위로만 주문 가능한 품목은 100, 낱개 주문이면 1. 예: 주사기(정림) 3cc 23G는 개수단위 100 / 단위 ea / 기본금액 5,200원.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
              <th className="px-3 py-2">사진</th>
              <th className="px-3 py-2">품목명</th>
              <th className="px-3 py-2">카테고리</th>
              <th className="px-3 py-2">개수단위</th>
              <th className="px-3 py-2">단위</th>
              <th className="px-3 py-2">기본금액</th>
              <th className="px-3 py-2">노출</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => imageInputRefs.current[it.id]?.click()}
                    className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-[10px] text-gray-400 dark:border-gray-700 dark:bg-white/5"
                    title="사진 업로드"
                  >
                    {it.image_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${API}${it.image_key}`} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      "+사진"
                    )}
                  </button>
                  <input
                    ref={(el) => { imageInputRefs.current[it.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(it, e)}
                  />
                </td>
                <td className="px-3 py-1.5"><input defaultValue={it.name} onBlur={(e) => updateField(it, { name: e.target.value })} className={inputCls + " w-full"} /></td>
                <td className="px-3 py-1.5"><input defaultValue={it.category} onBlur={(e) => updateField(it, { category: e.target.value })} className={inputCls + " w-24"} /></td>
                <td className="px-3 py-1.5"><input type="number" defaultValue={it.pack_size} onBlur={(e) => updateField(it, { pack_size: Number(e.target.value) || 1 })} className={inputCls + " w-16"} /></td>
                <td className="px-3 py-1.5"><input defaultValue={it.unit} onBlur={(e) => updateField(it, { unit: e.target.value })} className={inputCls + " w-16"} /></td>
                <td className="px-3 py-1.5"><input type="number" defaultValue={it.unit_price} onBlur={(e) => updateField(it, { unit_price: Number(e.target.value) })} className={inputCls + " w-24"} /></td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => updateField(it, { is_active: !it.is_active })}>{it.is_active ? "✅" : "⬜"}</button>
                </td>
                <td className="px-3 py-1.5 text-center"><button onClick={() => removeItem(it.id)} className="text-error-500">×</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-400">등록된 품목이 없습니다</td></tr>}
          </tbody>
        </table>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
          <a
            href={adminCatalogExportUrl()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
          >
            ⬇ 엑셀로 내보내기
          </a>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {importing ? "가져오는 중..." : "⬆ 엑셀로 추가하기"}
          </button>
          <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
        </div>
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
