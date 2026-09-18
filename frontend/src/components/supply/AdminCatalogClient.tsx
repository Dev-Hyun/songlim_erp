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
const inputCls = "field";

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

  if (loading) return <div className="empty-state">불러오는 중...</div>;

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
      <div className="surface-card p-3">
        <h3 className="card-title mb-1">카테고리별 노출 제한</h3>
        <p className="mb-3 fg-subtle text-ui-xs">지정한 카테고리는 여기 등록된 병원종별 계정에만 노출됩니다 (예: &quot;동물병원&quot; 카테고리 → 동물병원 계정만).</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={accessForm.category} onChange={(e) => setAccessForm({ ...accessForm, category: e.target.value })} placeholder="카테고리명" className={inputCls} />
          <select value={accessForm.hospital_type} onChange={(e) => setAccessForm({ ...accessForm, hospital_type: e.target.value })} className={inputCls}>
            {HOSPITAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={addAccess} className="btn btn-default">허용 추가</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.map((a) => (
            <span key={a.id} className="chip">
              {a.category} → {a.hospital_type}
              <button onClick={async () => { await adminRemoveCategoryAccess(a.id); load(); }} className="text-error-600 dark:text-error-400">×</button>
            </span>
          ))}
          {access.length === 0 && <span className="fg-subtle text-ui-xs">제한된 카테고리가 없습니다 (모두 전체공개)</span>}
        </div>
      </div>

      <div className="overflow-x-auto surface-card">
        <div className="toolbar justify-between">
          <h3 className="card-title">소모품 카탈로그</h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              placeholder="품목명/제조사/코드/카테고리 검색..."
              className="field w-56"
            />
            <button onClick={() => setShowEditor(true)} className="btn btn-primary">
              소모품 품목 관리자 사이트
            </button>
          </div>
        </div>
        <table className="table-dense min-w-[720px]">
          <thead>
            <tr>
              <th className="th-dense">사진</th>
              <th className="th-dense">코드</th>
              <th className="th-dense">품목명</th>
              <th className="th-dense">제조사</th>
              <th className="th-dense">카테고리</th>
              <th className="th-dense">단위</th>
              <th className="th-dense">기본금액</th>
              <th className="th-dense">노출</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((it) => (
              <tr key={it.id} className="row-hover">
                <td className="td-dense py-1.5">
                  <div className="surface-sub hairline fg-subtle flex h-10 w-10 items-center justify-center overflow-hidden rounded-control border">
                    {it.image_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${API}${it.image_key}`} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      "-"
                    )}
                  </div>
                </td>
                <td className="td-dense fg-muted py-1.5">{it.code || "-"}</td>
                <td className="td-dense fg-strong py-1.5 font-medium">{it.name}</td>
                <td className="td-dense fg-muted py-1.5">{it.manufacturer || "-"}</td>
                <td className="td-dense fg-muted py-1.5">{it.category}</td>
                <td className="td-dense fg-muted py-1.5">{it.unit}</td>
                <td className="td-dense fg-muted py-1.5 tabular-nums">{it.unit_price.toLocaleString()}원</td>
                <td className="td-dense py-1.5 text-center">{it.is_active ? "✅" : "⬜"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="empty-state">{search ? "검색 결과가 없습니다" : "등록된 품목이 없습니다"}</td></tr>}
          </tbody>
        </table>
        {filtered.length > visibleCount && (
          <div className="hairline border-t p-3 text-center">
            <button
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="btn btn-default"
            >
              더보기 ({visibleItems.length}/{filtered.length})
            </button>
          </div>
        )}
        <div className="hairline flex justify-end gap-2 border-t p-3">
          <a
            href={adminCatalogExportUrl()}
            className="btn btn-default"
          >
            ⬇ 엑셀로 내보내기
          </a>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="btn btn-default"
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
