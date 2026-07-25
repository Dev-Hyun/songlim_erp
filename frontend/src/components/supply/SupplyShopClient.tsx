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
  fetchMyOrders,
  fetchReorderItems,
  removeFavorite,
} from "./api";

interface CartLine {
  item: CatalogItem;
  qty: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

const ICONS: Record<string, string> = {
  소모품: "💉",
  의료용품: "🩹",
  동물병원: "🐾",
};

export default function SupplyShopClient() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [orderRequest, setOrderRequest] = useState("");

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

  const subCategories = useMemo(
    () => (category ? Array.from(new Set(items.filter((it) => it.sub_category).map((it) => it.sub_category as string))).sort() : []),
    [items, category]
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (favoritesOnly ? it.is_favorite : true) &&
          (!search || it.name.includes(search)) &&
          (!subCategory || it.sub_category === subCategory)
      ),
    [items, favoritesOnly, search, subCategory]
  );

  const cartLines = Object.values(cart);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.item.price * l.qty, 0);

  function addToCart(item: CatalogItem, qty: number) {
    setCart((prev) => ({ ...prev, [item.id]: { item, qty: (prev[item.id]?.qty || 0) + qty } }));
  }

  function setQty(id: number, qty: number) {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...prev[id], qty } };
    });
  }

  function removeFromCart(id: number) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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

  async function loadPreviousOrder() {
    setLoadingPrev(true);
    try {
      const orders = await fetchMyOrders();
      if (orders.length === 0) {
        alert("이전 발주 내역이 없습니다");
        return;
      }
      const rows = await fetchReorderItems(orders[0].id);
      setCart((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          const found = items.find((it) => it.id === r.catalog_id);
          if (found) next[r.catalog_id] = { item: found, qty: r.qty };
        }
        return next;
      });
    } finally {
      setLoadingPrev(false);
    }
  }

  async function submitOrder() {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    try {
      const res = await createOrder(cartLines.map((l) => ({ catalog_id: l.item.id, qty: l.qty })), orderRequest.trim() || undefined);
      setCart({});
      setOrderRequest("");
      alert(`발주가 접수되었습니다 (발주번호 #${res.id}, 총액 ${res.total_amount.toLocaleString()}원)`);
      router.push("/my/supply-orders");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="shrink-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] lg:w-48">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">카테고리</div>
        <div className="flex flex-wrap gap-1.5 lg:block">
          <button
            onClick={() => { setCategory(null); setSubCategory(null); setFavoritesOnly(false); }}
            className={`mb-1 flex w-auto items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold lg:w-full ${
              !category && !favoritesOnly ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            <span>전체 품목</span>
            <span className="text-[10px] text-gray-400">{categories.reduce((s, c) => s + c.count, 0)}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => { setCategory(c.category); setSubCategory(null); setFavoritesOnly(false); }}
              className={`mb-1 flex w-auto items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold lg:w-full ${
                category === c.category ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              <span>{ICONS[c.category] || "📦"} {c.category}</span>
              <span className="text-[10px] text-gray-400">{c.count}</span>
            </button>
          ))}
          <button
            onClick={() => { setFavoritesOnly(true); setCategory(null); setSubCategory(null); }}
            className={`flex w-auto items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold lg:mt-2 lg:w-full ${
              favoritesOnly ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            ⭐ 즐겨찾기
          </button>
        </div>
        {subCategories.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">소분류</div>
            <div className="flex flex-wrap gap-1.5 lg:block">
              <button
                onClick={() => setSubCategory(null)}
                className={`mb-1 block w-auto rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold lg:w-full ${
                  !subCategory ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                전체
              </button>
              {subCategories.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setSubCategory(sc)}
                  className={`mb-1 block w-auto rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold lg:w-full ${
                    subCategory === sc ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.01]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상품명으로 검색"
            className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 sm:w-72"
          />
          <button
            onClick={loadPreviousOrder}
            disabled={loadingPrev}
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            {loadingPrev ? "불러오는 중..." : "↻ 이전 발주 내역 불러오기"}
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">해당 조건의 품목이 없습니다</div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((it) => (
              <div
                key={it.id}
                onClick={() => openDetail(it)}
                className="relative flex cursor-pointer flex-col rounded-2xl border border-gray-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <button
                  onClick={(e) => toggleFavorite(it, e)}
                  className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs dark:bg-gray-900/85 ${it.is_favorite ? "text-warning-500" : "text-gray-300"}`}
                >
                  ★
                </button>
                <div className="mb-3 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-brand-50 text-2xl dark:bg-brand-500/10">
                  {it.image_key ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API}${it.image_key}`} alt={it.name} className="h-full w-full object-cover" />
                  ) : (
                    ICONS[it.category] || "📦"
                  )}
                </div>
                <div className="mb-0.5 text-[10px] font-bold uppercase text-brand-500">{it.category}{it.sub_category ? ` · ${it.sub_category}` : ""}</div>
                <div className="mb-1 line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-snug text-gray-800 dark:text-white/90">{it.name}</div>
                <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{it.manufacturer || "제조사 미상"}</div>
                <div className="mb-2 text-[11px] text-gray-400">{it.spec ? `${it.spec} · ` : ""}{it.unit}</div>
                <div className="mt-auto">
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="whitespace-nowrap text-base font-extrabold text-gray-900 dark:text-white">{it.price.toLocaleString()}원</span>
                    {it.has_special_price && it.base_price !== it.price && (
                      <span className="text-[10px] text-gray-400 line-through">{it.base_price.toLocaleString()}</span>
                    )}
                    {it.has_special_price && (
                      <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-[9px] font-bold text-success-600 dark:bg-success-500/15 dark:text-success-400">
                        병원 전용가
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); addToCart(it, 1); }}
                    className="mt-2 w-full rounded-lg bg-brand-500 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                    title="장바구니 담기"
                  >
                    담기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 장바구니 (우측 고정 패널) */}
      <aside className="shrink-0 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] lg:sticky lg:top-24 lg:w-80">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white/90">🛒 발주 목록</h3>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">{cartCount}개</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {cartLines.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-gray-400">담은 소모품이 없습니다.<br />품목의 &quot;담기&quot;를 눌러 추가하세요.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {cartLines.map((l) => (
                <li key={l.item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-gray-800 dark:text-white/90">{l.item.name}</div>
                      <div className="truncate text-[10px] text-gray-400">{l.item.manufacturer || "제조사 미상"} · {l.item.spec ? `${l.item.spec} · ` : ""}{l.item.unit}</div>
                    </div>
                    <button onClick={() => removeFromCart(l.item.id)} className="shrink-0 text-xs text-gray-300 hover:text-error-500">✕</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                      <button onClick={() => setQty(l.item.id, l.qty - 1)} className="h-7 w-7 bg-gray-50 text-xs dark:bg-white/5">−</button>
                      <span className="w-8 text-center text-xs font-bold">{l.qty}</span>
                      <button onClick={() => setQty(l.item.id, l.qty + 1)} className="h-7 w-7 bg-gray-50 text-xs dark:bg-white/5">+</button>
                    </div>
                    <span className="text-xs font-bold text-gray-800 dark:text-white/90">{(l.item.price * l.qty).toLocaleString()}원</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-100 p-4 dark:border-gray-800">
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-300">요청사항</label>
          <textarea
            value={orderRequest}
            onChange={(e) => setOrderRequest(e.target.value)}
            rows={3}
            placeholder="예: 배송희망일, 상품/포장 관련 요청 등"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900"
          />
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">합계</span>
            <span className="text-lg font-extrabold text-gray-900 dark:text-white">{cartTotal.toLocaleString()}원</span>
          </div>
          <button
            onClick={submitOrder}
            disabled={submitting || cartLines.length === 0}
            className="w-full rounded-lg bg-brand-500 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {submitting ? "주문 처리 중..." : "주문하기"}
          </button>
        </div>
      </aside>

      {/* 상세 (전체화면) */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 sm:p-8" onClick={() => setDetail(null)}>
          <div
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
              <span className="text-xs font-bold uppercase tracking-wide text-brand-500">{detail.category}</span>
              <button onClick={() => setDetail(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-sm text-gray-500 dark:border-gray-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 sm:flex sm:gap-8">
              <div className="mb-5 flex h-56 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 text-6xl dark:bg-brand-500/10 sm:mb-0 sm:w-72 sm:shrink-0">
                {detail.image_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API}${detail.image_key}`} alt={detail.name} className="h-full w-full object-cover" />
                ) : (
                  ICONS[detail.category] || "📦"
                )}
              </div>
              <div className="flex-1">
                <h3 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{detail.name}</h3>
                <dl className="mb-4 space-y-1 text-sm">
                  <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-400">제조사</dt><dd className="font-medium text-gray-700 dark:text-gray-200">{detail.manufacturer || "-"}</dd></div>
                  <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-400">규격</dt><dd className="font-medium text-gray-700 dark:text-gray-200">{detail.spec || "-"}</dd></div>
                  <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-400">단위</dt><dd className="font-medium text-gray-700 dark:text-gray-200">{detail.unit}</dd></div>
                  <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-400">카테고리</dt><dd className="font-medium text-gray-700 dark:text-gray-200">{detail.category}{detail.sub_category ? ` · ${detail.sub_category}` : ""}</dd></div>
                </dl>
                {detail.description && <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">{detail.description}</p>}
                <div className="flex items-baseline justify-between rounded-xl bg-brand-50 px-4 py-3.5 dark:bg-brand-500/10">
                  <span className="text-xs font-semibold text-gray-500">병원 적용가</span>
                  <span className="text-2xl font-extrabold text-brand-500">{detail.price.toLocaleString()}원</span>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                    <button onClick={() => setDetailQty((q) => Math.max(1, q - 1))} className="h-10 w-10 bg-gray-50 text-sm dark:bg-white/5">−</button>
                    <span className="w-12 text-center text-sm font-bold">{detailQty}</span>
                    <button onClick={() => setDetailQty((q) => q + 1)} className="h-10 w-10 bg-gray-50 text-sm dark:bg-white/5">+</button>
                  </div>
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
        </div>
      )}
    </div>
  );
}
