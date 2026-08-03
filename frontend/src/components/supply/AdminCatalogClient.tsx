"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdminCatalogItem,
  CategoryAccessRow,
  adminAddCategoryAccess,
  adminCatalogExportUrl,
  adminFetchCatalog,
  adminFetchCategoryAccess,
  adminImportCatalog,
  adminRemoveCategoryAccess,
} from "./api";
import AdminCatalogGridEditor from "./AdminCatalogGridEditor";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
const HOSPITAL_TYPES = ["의원", "병원", "대학병원", "동물병원"];
const inputCls = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900";

const PAGE_SIZE = 30;

export default function AdminCatalogClient() {
  const [items, setItems] = useState<AdminCatalogItem[]>([]);
  const [access, setAccess] = useState<CategoryAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [accessForm, setAccessForm] = useState({ category: "", hospital_type: "동물병원" });
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const importInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    Promise.all([adminFetchCatalog(), adminFetchCategoryAccess()])
      .then(([c, a]) => { setItems(c); setAccess(a); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

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

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  const filtered = items.filter((it) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      it.name.toLowerCase().includes(q) ||
      (it.manufacturer || "").toLowerCase().includes(q) ||
      (it.code || "").toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  });
  const visibleItems = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-1 text-sm font-bold text-gray-800 dark:text-white/90">카테고리별 노출 제한</h3>
        <p className="mb-3 text-[11px] text-gray-400">지정한 카테고리는 여기 등록된 병원종별 계정에만 노출됩니다 (예: &quot;동물병원&quot; 카테고리 → 동물병원 계정만).</p>
        <div className="mb-3 flex flex-wrap gap-2">
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

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white/90">소모품 카탈로그</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              placeholder="품목명/제조사/코드/카테고리 검색..."
              className="w-56 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            />
            <button onClick={() => setShowEditor(true)} className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
              소모품 품목 관리자 사이트
            </button>
          </div>
        </div>
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
              <th className="px-3 py-2">사진</th>
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">품목명</th>
              <th className="px-3 py-2">제조사</th>
              <th className="px-3 py-2">카테고리</th>
              <th className="px-3 py-2">단위</th>
              <th className="px-3 py-2">기본금액</th>
              <th className="px-3 py-2">노출</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((it) => (
              <tr key={it.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="px-3 py-1.5">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/5">
                    {it.image_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${API}${it.image_key}`} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      "-"
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{it.code || "-"}</td>
                <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-white/90">{it.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{it.manufacturer || "-"}</td>
                <td className="px-3 py-1.5 text-gray-500">{it.category}</td>
                <td className="px-3 py-1.5 text-gray-500">{it.unit}</td>
                <td className="px-3 py-1.5 text-gray-500">{it.unit_price.toLocaleString()}원</td>
                <td className="px-3 py-1.5 text-center">{it.is_active ? "✅" : "⬜"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-400">{search ? "검색 결과가 없습니다" : "등록된 품목이 없습니다"}</td></tr>}
          </tbody>
        </table>
        {filtered.length > visibleCount && (
          <div className="border-t border-gray-100 p-3 text-center dark:border-gray-800">
            <button
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="rounded-full border border-gray-300 px-5 py-1.5 text-xs font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
            >
              더보기 ({visibleItems.length}/{filtered.length})
            </button>
          </div>
        )}
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

      {showEditor && (
        <AdminCatalogGridEditor
          onClose={() => {
            setShowEditor(false);
            load();
          }}
        />
      )}
    </div>
  );
}
