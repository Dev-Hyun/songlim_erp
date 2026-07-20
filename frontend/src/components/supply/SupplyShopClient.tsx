"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CatalogItem,
  CategoryCount,
  addFavorite,
  createOrder,
  fetchCatalog,
  fetchCategories,
  fetchReorderItems,
  removeFavorite,
} from "./api";

interface CartLine {
  item: CatalogItem;
  qty: number;
}

const ICONS: Record<string, string> = {
  소모품: "💉",
  의료용품: "🩹",
  동물병원: "🐾",
};

export default function SupplyShopClient() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([fetchCategories(), fetchCatalog(category || undefined)])
      .then(([cats, cat]) => {
        setCategories(cats);
        setItems(cat);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [category]);

  const reorderAppliedRef = useRef(false);
  useEffect(() => {
    // 재주문(reorder) 딥링크: /supply?reorder=123 — 최초 카탈로그 로드 시 1회만 장바구니에 반영
    if (reorderAppliedRef.current || items.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const reorderId = params.get("reorder");
    if (!reorderId) return;
    reorderAppliedRef.current = true;
    fetchReorderItems(Number(reorderId)).then((rows) => {
      setCart((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          const found = items.find((it) => it.id === r.catalog_id);
          if (found) next[r.catalog_id] = { item: found, qty: r.qty };
        }
        return next;
      });
    });
  }, [items]);

  const filtered = useMemo(
    () => items.filter((it) => (favoritesOnly ? it.is_favorite : true) && (!search || it.name.includes(search))),
    [items, favoritesOnly, search]
  );

  const cartLines = Object.values(cart);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.item.price * l.qty, 0);

  function addToCart(item: CatalogItem, qty: number) {
    setCart((prev) => ({ ...prev, [item.id]: { item, qty: (prev[item.id]?.qty || 0) + qty } }));
  }

  async function toggleFavorite(item: CatalogItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (item.is_favorite) await removeFavorite(item.id);
    else await addFavorite(item.id);
    load();
  }

  function openDetail(item: CatalogItem) {
    setDetail(item);
    setDetailQty(1);
  }

  async function submitOrder() {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    try {
      const res = await createOrder(cartLines.map((l) => ({ catalog_id: l.item.id, qty: l.qty })));
      setCart({});
      alert(`발주가 접수되었습니다 (발주번호 #${res.id}, 총액 ${res.total_amount.toLocaleString()}원)`);
      router.push("/my/supply-orders");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex gap-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      <aside className="w-52 shrink-0 border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">카테고리</div>
        <button
          onClick={() => setCategory(null)}
          className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${
            !category && !favoritesOnly ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          <span>전체 품목</span>
          <span className="text-[10px] text-gray-400">{categories.reduce((s, c) => s + c.count, 0)}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.category}
            onClick={() => { setCategory(c.category); setFavoritesOnly(false); }}
            className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${
              category === c.category ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            <span>{ICONS[c.category] || "📦"} {c.category}</span>
            <span className="text-[10px] text-gray-400">{c.count}</span>
          </button>
        ))}
        <div className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-gray-400">내 즐겨찾기</div>
        <button
          onClick={() => { setFavoritesOnly(true); setCategory(null); }}
          className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${
            favoritesOnly ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          ⭐ 즐겨찾기
        </button>
      </aside>

      <main className="flex-1 bg-gray-50 p-5 pb-24 dark:bg-white/[0.01]">
        <div className="mb-4 flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상품명으로 검색"
            className="w-72 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs dark:border-gray-700 dark:bg-gray-900"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">해당 조건의 품목이 없습니다</div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((it) => (
              <div
                key={it.id}
                onClick={() => openDetail(it)}
                className="relative cursor-pointer rounded-2xl border border-gray-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <button
                  onClick={(e) => toggleFavorite(it, e)}
                  className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs dark:bg-gray-900/85 ${it.is_favorite ? "text-warning-500" : "text-gray-300"}`}
                >
                  ★
                </button>
                <div className="mb-3 flex h-20 items-center justify-center rounded-lg bg-brand-50 text-2xl dark:bg-brand-500/10">
                  {ICONS[it.category] || "📦"}
                </div>
                <div className="mb-0.5 text-[10px] font-bold uppercase text-brand-500">{it.category}</div>
                <div className="mb-1 min-h-[34px] text-[13px] font-semibold leading-snug text-gray-800 dark:text-white/90">{it.name}</div>
                <div className="mb-2 text-[11px] text-gray-400">단위: {it.unit}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-extrabold text-gray-900 dark:text-white">{it.price.toLocaleString()}원</span>
                  {it.has_special_price && it.base_price !== it.price && (
                    <span className="text-[11px] text-gray-400 line-through">{it.base_price.toLocaleString()}원</span>
                  )}
                </div>
                {it.has_special_price && (
                  <span className="mt-1.5 inline-block rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-bold text-success-600 dark:bg-success-500/15 dark:text-success-400">
                    병원 전용 단가
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 하단 주문요약 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center gap-5 border-t border-gray-200 bg-white px-6 py-3.5 shadow-[0_-8px_24px_rgba(16,24,40,0.08)] dark:border-gray-800 dark:bg-gray-900 md:left-[290px]">
        <div className="ml-auto text-right">
          <div className="text-[11px] text-gray-400">담은 품목 <b className="text-gray-700 dark:text-gray-200">{cartCount}</b>개</div>
          <div className="text-lg font-extrabold text-gray-900 dark:text-white">{cartTotal.toLocaleString()}원</div>
        </div>
        <button
          onClick={submitOrder}
          disabled={submitting || cartLines.length === 0}
          className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {submitting ? "발주 처리 중..." : "발주서 작성 →"}
        </button>
      </div>

      {/* 상세 드로어 */}
      {detail && (
        <>
          <div className="fixed inset-0 z-30 bg-gray-900/30" onClick={() => setDetail(null)} />
          <div className="fixed bottom-0 right-0 top-0 z-40 flex w-[420px] max-w-[90vw] flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <span className="text-[11px] font-bold uppercase tracking-wide text-brand-500">{detail.category}</span>
              <button onClick={() => setDetail(null)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-xs text-gray-500 dark:border-gray-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-4 flex h-36 items-center justify-center rounded-2xl bg-brand-50 text-5xl dark:bg-brand-500/10">
                {ICONS[detail.category] || "📦"}
              </div>
              <h3 className="mb-1 text-lg font-bold text-gray-900 dark:text-white">{detail.name}</h3>
              <p className="mb-4 text-xs text-gray-400">단위: {detail.unit} · {detail.category}</p>
              {detail.description && <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">{detail.description}</p>}
              <div className="flex items-baseline justify-between rounded-xl bg-brand-50 px-4 py-3.5 dark:bg-brand-500/10">
                <span className="text-xs font-semibold text-gray-500">병원 적용가</span>
                <span className="text-xl font-extrabold text-brand-500">{detail.price.toLocaleString()}원</span>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                  <button onClick={() => setDetailQty((q) => Math.max(1, q - 1))} className="h-9 w-9 bg-gray-50 text-sm dark:bg-white/5">−</button>
                  <span className="w-11 text-center text-sm font-bold">{detailQty}</span>
                  <button onClick={() => setDetailQty((q) => q + 1)} className="h-9 w-9 bg-gray-50 text-sm dark:bg-white/5">+</button>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-200 p-4 dark:border-gray-800">
              <button
                onClick={() => { addToCart(detail, detailQty); setDetail(null); }}
                className="w-full rounded-lg bg-brand-500 py-3 text-sm font-bold text-white"
              >
                장바구니에 담기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
