"use client";

import { useEffect, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  AdminCatalogItem,
  CatalogInput,
  adminCreateCatalog,
  adminDeleteCatalog,
  adminFetchCatalog,
  adminReorderCatalog,
  adminUpdateCatalog,
} from "./api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
const ITEM_TYPE = "catalog-card";

const ICONS: Record<string, string> = {
  소모품: "💉",
  의료용품: "🩹",
  동물병원: "🐾",
};

const EMPTY_FORM: CatalogInput = {
  code: "", name: "", manufacturer: "", spec: "", category: "소모품", sub_category: "", unit: "개",
  unit_price: 0, description: "", image_key: "", is_active: true,
};

function Card({
  item,
  index,
  draggable,
  onMove,
  onDrop,
  onOpen,
}: {
  item: AdminCatalogItem;
  index: number;
  draggable: boolean;
  onMove: (from: number, to: number) => void;
  onDrop: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, dragRef] = useDrag({
    type: ITEM_TYPE,
    item: { index },
    canDrag: () => draggable,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end: onDrop,
  });
  const [, dropRef] = useDrop({
    accept: ITEM_TYPE,
    canDrop: () => draggable,
    hover: (dragged: { index: number }) => {
      if (!draggable || dragged.index === index) return;
      onMove(dragged.index, index);
      dragged.index = index;
    },
  });
  dragRef(dropRef(ref));

  return (
    <div
      ref={ref}
      onClick={onOpen}
      className={`relative cursor-pointer rounded-2xl border border-gray-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03] ${
        isDragging ? "opacity-30" : ""
      } ${!item.is_active ? "opacity-50" : ""}`}
    >
      {draggable && (
        <div className="absolute left-2 top-2 cursor-grab text-gray-300" title="드래그해서 순서변경">⠿</div>
      )}
      <div className="mb-3 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-brand-50 text-2xl dark:bg-brand-500/10">
        {item.image_key ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${API}${item.image_key}`} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          ICONS[item.category] || "📦"
        )}
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          {item.category}{item.sub_category ? ` · ${item.sub_category}` : ""}
        </span>
        {item.code && <span className="text-[10px] text-gray-400">#{item.code}</span>}
      </div>
      <div className="mb-1.5 line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-snug text-gray-800 dark:text-white/90">{item.name}</div>
      <dl className="mb-2 space-y-0.5 text-[11px]">
        <div className="flex gap-1"><dt className="w-9 shrink-0 text-gray-400">제조사</dt><dd className="truncate font-medium text-gray-600 dark:text-gray-300">{item.manufacturer || "-"}</dd></div>
        <div className="flex gap-1"><dt className="w-9 shrink-0 text-gray-400">규격</dt><dd className="truncate font-medium text-gray-600 dark:text-gray-300">{item.spec || "-"}</dd></div>
        <div className="flex gap-1"><dt className="w-9 shrink-0 text-gray-400">단위</dt><dd className="truncate font-medium text-gray-600 dark:text-gray-300">{item.unit}</dd></div>
      </dl>
      <div className="text-base font-extrabold text-gray-900 dark:text-white">{item.unit_price.toLocaleString()}원</div>
      {!item.is_active && <span className="mt-1.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-white/10">비노출</span>}
    </div>
  );
}

export default function AdminCatalogGridEditor({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<AdminCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminCatalogItem | null>(null);
  const [form, setForm] = useState<CatalogInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [subCategoryFilter, setSubCategoryFilter] = useState<string | null>(null);
  const [filteredItems, setFilteredItems] = useState<AdminCatalogItem[]>([]);
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    adminFetchCatalog().then(setItems).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const categories = Array.from(new Set(items.map((it) => it.category))).sort();
  const subCategories = categoryFilter
    ? Array.from(new Set(items.filter((it) => it.category === categoryFilter && it.sub_category).map((it) => it.sub_category as string))).sort()
    : [];

  // 카테고리(+소분류)를 선택했을 때만 그 안에서 드래그 순서 변경이 가능하도록 별도 상태로 분리 —
  // "전체" 보기는 추가한 순서(id) 그대로 보여주고 재정렬 대상이 아니다.
  useEffect(() => {
    if (!categoryFilter) return;
    setFilteredItems(
      items.filter((it) => it.category === categoryFilter && (!subCategoryFilter || it.sub_category === subCategoryFilter))
    );
  }, [items, categoryFilter, subCategoryFilter]);

  const q = search.trim().toLowerCase();
  const baseItems = categoryFilter ? filteredItems : [...items].sort((a, b) => a.id - b.id);
  // 검색 중에는 카테고리와 무관하게 전체에서 찾고, 드래그 재정렬은 비활성화한다
  const displayItems = q
    ? [...items].filter((it) => `${it.name} ${it.manufacturer || ""} ${it.code || ""}`.toLowerCase().includes(q))
    : baseItems;
  const canDrag = !!categoryFilter && !q;

  function selectCategory(c: string | null) {
    setCategoryFilter(c);
    setSubCategoryFilter(null);
  }

  function moveCard(from: number, to: number) {
    if (!categoryFilter) return;
    setFilteredItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function persistOrder() {
    if (!categoryFilter) return;
    await adminReorderCatalog(filteredItems.map((it) => it.id));
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(item: AdminCatalogItem) {
    setEditing(item);
    setForm({
      code: item.code || "", name: item.name, manufacturer: item.manufacturer || "",
      spec: item.spec || "", category: item.category, sub_category: item.sub_category || "", unit: item.unit,
      unit_price: item.unit_price, description: item.description || "",
      image_key: item.image_key || "", is_active: item.is_active,
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/api/uploads/image`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) return;
    const data: { url: string } = await res.json();
    setForm((f) => ({ ...f, image_key: data.url }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await adminUpdateCatalog(editing.id, form);
      else await adminCreateCatalog(form);
      openNew();
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 품목을 삭제하시겠습니까?")) return;
    await adminDeleteCatalog(id);
    if (editing?.id === id) openNew();
    load();
  }

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col bg-white dark:bg-gray-900">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5 dark:border-gray-800">
        <h2 className="shrink-0 text-base font-bold text-gray-800 dark:text-white/90">소모품 품목 관리자 사이트</h2>
        <div className="relative min-w-0 flex-1 max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품목명·제조사·코드 검색"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <button onClick={onClose} className="shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">
          닫기
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <DndProvider backend={HTML5Backend}>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => selectCategory(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${!categoryFilter ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"}`}
              >
                전체
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => selectCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryFilter === c ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"}`}
                >
                  {c}
                </button>
              ))}
              {q && <span className="ml-1 text-[11px] text-gray-400">&quot;{search}&quot; 검색 결과 {displayItems.length}건</span>}
            </div>
            {categoryFilter && subCategories.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSubCategoryFilter(null)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${!subCategoryFilter ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" : "bg-gray-50 text-gray-500 dark:bg-white/5"}`}
                >
                  소분류 전체
                </button>
                {subCategories.map((sc) => (
                  <button
                    key={sc}
                    onClick={() => setSubCategoryFilter(sc)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${subCategoryFilter === sc ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" : "bg-gray-50 text-gray-500 dark:bg-white/5"}`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            )}
            {canDrag && <div className="mb-3 text-[11px] text-gray-400">드래그해서 이 카테고리 안에서 순서 변경</div>}
            {loading ? (
              <div className="p-10 text-center text-sm text-gray-400">불러오는 중...</div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                <button
                  onClick={openNew}
                  className={`flex h-full min-h-[190px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3.5 text-sm font-bold ${
                    !editing ? "border-brand-400 bg-brand-50 text-brand-600 dark:bg-brand-500/10" : "border-gray-300 text-gray-400 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700"
                  }`}
                >
                  <span className="text-2xl">+</span>
                  새 품목
                </button>
                {displayItems.map((it, i) => (
                  <Card key={it.id} item={it} index={i} draggable={canDrag} onMove={moveCard} onDrop={persistOrder} onOpen={() => openEdit(it)} />
                ))}
              </div>
            )}
          </div>
        </DndProvider>

        <div className="w-full shrink-0 space-y-3 overflow-y-auto border-t border-gray-200 p-5 dark:border-gray-800 lg:w-80 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white/90">{editing ? `수정: ${editing.name}` : "새 품목 추가"}</h3>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400 dark:border-gray-700 dark:bg-white/5"
          >
            {form.image_key ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API}${form.image_key}`} alt="" className="h-full w-full object-cover" />
            ) : (
              "+ 사진 업로드"
            )}
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <p className="text-[11px] leading-relaxed text-gray-400">
            권장 사진 규격: 정사각형 1000×1000px 이상 (예: 휴대폰 카메라로 품목을 가운데 두고 촬영 후 정사각형으로 자르기).
            모바일·PC 카드에서 모두 잘리지 않고 선명하게 보입니다.
          </p>

          <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="코드" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="품목명" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="제조사" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="규격(선택)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="카테고리" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })} placeholder="소분류(선택)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="단위 (예: 100입/1box)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} placeholder="기본금액" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명(선택)" rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            병원측에 노출
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {editing ? "수정 저장" : "추가"}
            </button>
            {editing && (
              <button onClick={() => handleDelete(editing.id)} className="rounded-lg border border-error-300 px-4 py-2.5 text-sm font-bold text-error-500 dark:border-error-800">
                삭제
              </button>
            )}
          </div>
          {editing && (
            <button onClick={openNew} className="w-full text-center text-xs font-semibold text-gray-400 hover:text-gray-600">
              취소하고 새 품목 추가로
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
