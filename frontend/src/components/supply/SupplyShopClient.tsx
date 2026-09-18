"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CatalogItem,
  CategoryCount,
  GiftTierPublic,
  addFavorite,
  createOrder,
  fetchCatalog,
  fetchCategories,
  fetchGiftTiers,
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
  const [giftEligible, setGiftEligible] = useState(false);
  const [giftTiers, setGiftTiers] = useState<GiftTierPublic[]>([]);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState<number | null>(null);

  useEffect(() => {
    fetchGiftTiers().then((r) => { setGiftEligible(r.eligible); setGiftTiers(r.tiers); });
  }, []);

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

  const sortedGiftTiers = useMemo(() => [...giftTiers].sort((a, b) => a.threshold_amount - b.threshold_amount), [giftTiers]);
  const unlockedGiftItems = useMemo(
    () => sortedGiftTiers.filter((t) => cartTotal >= t.threshold_amount).flatMap((t) => t.items),
    [sortedGiftTiers, cartTotal]
  );
  const nextGiftTier = useMemo(() => sortedGiftTiers.find((t) => cartTotal < t.threshold_amount) || null, [sortedGiftTiers, cartTotal]);
  const giftProgressPct = nextGiftTier ? Math.min(100, Math.round((cartTotal / nextGiftTier.threshold_amount) * 100)) : 100;

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

  function openOrderFlow() {
    if (cartLines.length === 0) return;
    if (giftEligible && sortedGiftTiers.length > 0) {
      setSelectedGiftId(null);
      setShowGiftModal(true);
    } else {
      submitOrder();
    }
  }

  async function submitOrder(giftItemId?: number | null) {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    try {
      const res = await createOrder(
        cartLines.map((l) => ({ catalog_id: l.item.id, qty: l.qty })),
        orderRequest.trim() || undefined,
        giftItemId || undefined
      );
      setCart({});
      setOrderRequest("");
      setShowGiftModal(false);
      alert(`발주가 접수되었습니다 (발주번호 #${res.id}, 총액 ${res.total_amount.toLocaleString()}원)`);
      router.push("/my/supply-orders");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="shrink-0 surface-card p-3 lg:w-48">
        <div className="label-eyebrow mb-1">카테고리</div>
        <div className="flex flex-wrap gap-1.5 lg:block">
          <button
            onClick={() => { setCategory(null); setSubCategory(null); setFavoritesOnly(false); }}
            className={`mb-1 flex w-auto items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-left text-ui font-medium transition-colors lg:w-full ${
              !category && !favoritesOnly ? "surface-inset fg-strong" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            <span>전체 품목</span>
            <span className="fg-subtle text-ui-xs tabular-nums">{categories.reduce((s, c) => s + c.count, 0)}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => { setCategory(c.category); setSubCategory(null); setFavoritesOnly(false); }}
              className={`mb-1 flex w-auto items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-left text-ui font-medium transition-colors lg:w-full ${
                category === c.category ? "surface-inset fg-strong" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              <span className="min-w-0 truncate">{ICONS[c.category] || "📦"} {c.category}</span>
              <span className="fg-subtle text-ui-xs tabular-nums">{c.count}</span>
            </button>
          ))}
          <button
            onClick={() => { setFavoritesOnly(true); setCategory(null); setSubCategory(null); }}
            className={`flex w-auto items-center gap-1.5 rounded-control px-2.5 py-1.5 text-left text-ui font-medium transition-colors lg:mt-2 lg:w-full ${
              favoritesOnly ? "surface-inset fg-strong" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
            }`}
          >
            ⭐ 즐겨찾기
          </button>
        </div>
        {subCategories.length > 0 && (
          <div className="hairline-soft mt-4 border-t pt-3">
            <div className="label-eyebrow mb-1">소분류</div>
            <div className="flex flex-wrap gap-1.5 lg:block">
              <button
                onClick={() => setSubCategory(null)}
                className={`mb-1 block w-auto rounded-control px-2.5 py-1 text-left text-ui-sm font-medium transition-colors lg:w-full ${
                  !subCategory ? "surface-inset fg-strong" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                전체
              </button>
              {subCategories.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setSubCategory(sc)}
                  className={`mb-1 block w-auto rounded-control px-2.5 py-1 text-left text-ui-sm font-medium transition-colors lg:w-full ${
                    subCategory === sc ? "surface-inset fg-strong" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main className="surface-sub hairline min-w-0 flex-1 rounded-card border p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 상품명으로 검색"
            className="field-lg w-full sm:w-72"
          />
          <button
            onClick={loadPreviousOrder}
            disabled={loadingPrev}
            className="btn btn-default h-9"
          >
            {loadingPrev ? "불러오는 중..." : "↻ 이전 발주 내역 불러오기"}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">해당 조건의 품목이 없습니다</div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((it) => (
              <div
                key={it.id}
                onClick={() => openDetail(it)}
                className="surface-card relative flex cursor-pointer flex-col p-3 transition-colors hover:border-gray-300 dark:hover:border-gray-700"
              >
                <button
                  onClick={(e) => toggleFavorite(it, e)}
                  className={`icon-btn absolute right-1.5 top-1.5 h-6 w-6 ${it.is_favorite ? "text-warning-500" : ""}`}
                >
                  ★
                </button>
                <div className="surface-sub mb-3 flex h-20 items-center justify-center overflow-hidden rounded-control text-2xl">
                  {it.image_key ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API}${it.image_key}`} alt={it.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    ICONS[it.category] || "📦"
                  )}
                </div>
                <div className="label-eyebrow mb-0.5 truncate">{it.category}{it.sub_category ? ` · ${it.sub_category}` : ""}</div>
                <div className="fg-strong mb-1 line-clamp-2 min-h-[34px] text-ui font-medium leading-snug">{it.name}</div>
                <div className="fg-muted text-ui-xs font-medium">{it.manufacturer || "제조사 미상"}</div>
                <div className="mb-2 fg-subtle text-ui-xs">{it.spec ? `${it.spec} · ` : ""}{it.unit}</div>
                <div className="mt-auto">
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="fg-strong whitespace-nowrap text-ui-lg font-semibold tabular-nums">{it.price.toLocaleString()}원</span>
                    {it.has_special_price && it.base_price !== it.price && (
                      <span className="fg-subtle text-ui-xs tabular-nums line-through">{it.base_price.toLocaleString()}</span>
                    )}
                    {it.has_special_price && (
                      <span className="chip">
                        <span className="dot bg-success-500" />
                        병원 전용가
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); addToCart(it, 1); }}
                    className="btn btn-default mt-2 w-full"
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
      <aside className="shrink-0 surface-card lg:sticky lg:top-24 lg:w-80">
        <div className="card-head justify-between">
          <h3 className="card-title">🛒 발주 목록</h3>
          <span className="chip-quiet tabular-nums">{cartCount}개</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {cartLines.length === 0 ? (
            <div className="empty-state">담은 소모품이 없습니다.<br />품목의 &quot;담기&quot;를 눌러 추가하세요.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {cartLines.map((l) => (
                <li key={l.item.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="fg-strong truncate text-ui font-medium">{l.item.name}</div>
                      <div className="fg-subtle truncate text-ui-xs">{l.item.manufacturer || "제조사 미상"} · {l.item.spec ? `${l.item.spec} · ` : ""}{l.item.unit}</div>
                    </div>
                    <button onClick={() => removeFromCart(l.item.id)} className="fg-subtle shrink-0 text-ui hover:text-error-500">✕</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="hairline flex items-center overflow-hidden rounded-control border">
                      <button onClick={() => setQty(l.item.id, l.qty - 1)} className="surface-sub fg-base h-7 w-7 text-ui">−</button>
                      <span className="fg-strong w-8 text-center text-ui font-medium tabular-nums">{l.qty}</span>
                      <button onClick={() => setQty(l.item.id, l.qty + 1)} className="surface-sub fg-base h-7 w-7 text-ui">+</button>
                    </div>
                    <span className="fg-strong text-ui font-medium tabular-nums">{(l.item.price * l.qty).toLocaleString()}원</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="hairline-soft border-t p-3">
          <label className="label-eyebrow mb-1 block">요청사항</label>
          <textarea
            value={orderRequest}
            onChange={(e) => setOrderRequest(e.target.value)}
            rows={3}
            placeholder="예: 배송희망일, 상품/포장 관련 요청 등"
            className="field-auto mb-3 w-full"
          />
          {giftEligible && sortedGiftTiers.length > 0 && (
            <div className="surface-sub hairline mb-3 rounded-card border p-3">
              <div className="fg-muted mb-1.5 flex items-center justify-between gap-2 text-ui-xs font-medium">
                <span>🎁 사은품</span>
                {nextGiftTier ? (
                  <span>{Math.max(0, nextGiftTier.threshold_amount - cartTotal).toLocaleString()}원 추가 시 사은품 선택 가능</span>
                ) : (
                  <span>사은품 선택 가능!</span>
                )}
              </div>
              <div className="surface-inset h-1.5 w-full overflow-hidden rounded-full">
                <div className="h-full rounded-full bg-gray-900 transition-all dark:bg-white" style={{ width: `${giftProgressPct}%` }} />
              </div>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <span className="fg-subtle text-ui-sm">합계</span>
            <span className="fg-strong text-ui-lg font-semibold tabular-nums">{cartTotal.toLocaleString()}원</span>
          </div>
          <button
            onClick={openOrderFlow}
            disabled={submitting || cartLines.length === 0}
            className="btn btn-primary h-10 w-full"
          >
            {submitting ? "주문 처리 중..." : "주문하기"}
          </button>
        </div>
      </aside>

      {/* 사은품 선택 모달 */}
      {showGiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" onClick={() => setShowGiftModal(false)}>
          <div
            className="surface-card flex max-h-full w-full max-w-md flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hairline border-b px-4 py-3">
              <h3 className="card-title">🎁 사은품을 선택하세요</h3>
              <p className="mt-1 fg-subtle text-ui-xs">주문 금액에 따라 아래 사은품 중 1개를 무료로 선택할 수 있습니다.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="surface-sub hairline mb-4 rounded-card border p-3">
                <div className="fg-muted mb-1.5 flex items-center justify-between gap-2 text-ui-xs font-medium">
                  <span>현재 주문금액 {cartTotal.toLocaleString()}원</span>
                  {nextGiftTier && <span>{(nextGiftTier.threshold_amount - cartTotal).toLocaleString()}원 추가 시 다음 구간</span>}
                </div>
                <div className="surface-inset h-1.5 w-full overflow-hidden rounded-full">
                  <div className="h-full rounded-full bg-gray-900 transition-all dark:bg-white" style={{ width: `${giftProgressPct}%` }} />
                </div>
              </div>
              {unlockedGiftItems.length === 0 ? (
                <div className="empty-state">
                  아직 선택 가능한 사은품이 없습니다.
                  {nextGiftTier && <><br />{nextGiftTier.threshold_amount.toLocaleString()}원 이상 주문 시 사은품을 선택할 수 있어요.</>}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="hairline fg-base flex cursor-pointer items-center gap-2 rounded-control border p-2.5 text-ui">
                    <input type="radio" checked={selectedGiftId === null} onChange={() => setSelectedGiftId(null)} />
                    사은품 선택 안 함
                  </label>
                  {unlockedGiftItems.map((g) => (
                    <label key={g.id} className={`fg-base flex cursor-pointer items-center gap-2 rounded-control border p-2.5 text-ui ${selectedGiftId === g.id ? "surface-sub border-gray-900 dark:border-white/40" : "hairline"}`}>
                      <input type="radio" checked={selectedGiftId === g.id} onChange={() => setSelectedGiftId(g.id)} />
                      🎁 {g.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="hairline flex gap-2 border-t p-3">
              <button onClick={() => setShowGiftModal(false)} className="btn btn-default h-10">취소</button>
              <button
                onClick={() => submitOrder(selectedGiftId)}
                disabled={submitting}
                className="btn btn-primary h-10 flex-1"
              >
                {submitting ? "주문 처리 중..." : "주문 확정하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상세 (전체화면) */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 sm:p-8" onClick={() => setDetail(null)}>
          <div
            className="surface-card flex max-h-full w-full max-w-3xl flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head justify-between">
              <span className="label-eyebrow">{detail.category}</span>
              <button onClick={() => setDetail(null)} className="icon-btn">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:flex sm:gap-6">
              <div className="surface-sub mb-5 flex h-56 items-center justify-center overflow-hidden rounded-card text-6xl sm:mb-0 sm:w-72 sm:shrink-0">
                {detail.image_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API}${detail.image_key}`} alt={detail.name} className="h-full w-full object-cover" />
                ) : (
                  ICONS[detail.category] || "📦"
                )}
              </div>
              <div className="flex-1">
                <h3 className="page-title mb-2">{detail.name}</h3>
                <dl className="mb-4 space-y-1 text-ui">
                  <div className="flex gap-2"><dt className="fg-subtle w-16 shrink-0">제조사</dt><dd className="fg-base font-medium">{detail.manufacturer || "-"}</dd></div>
                  <div className="flex gap-2"><dt className="fg-subtle w-16 shrink-0">규격</dt><dd className="fg-base font-medium">{detail.spec || "-"}</dd></div>
                  <div className="flex gap-2"><dt className="fg-subtle w-16 shrink-0">단위</dt><dd className="fg-base font-medium">{detail.unit}</dd></div>
                  <div className="flex gap-2"><dt className="fg-subtle w-16 shrink-0">카테고리</dt><dd className="fg-base font-medium">{detail.category}{detail.sub_category ? ` · ${detail.sub_category}` : ""}</dd></div>
                </dl>
                {detail.description && <p className="fg-base mb-4 text-ui">{detail.description}</p>}
                <div className="surface-sub hairline flex items-baseline justify-between rounded-card border px-3 py-3">
                  <span className="label-eyebrow">병원 적용가</span>
                  <span className="fg-strong text-ui-2xl font-semibold tabular-nums">{detail.price.toLocaleString()}원</span>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="hairline flex items-center overflow-hidden rounded-control border">
                    <button onClick={() => setDetailQty((q) => Math.max(1, q - 1))} className="surface-sub fg-base h-10 w-10 text-ui">−</button>
                    <span className="fg-strong w-12 text-center text-ui font-medium tabular-nums">{detailQty}</span>
                    <button onClick={() => setDetailQty((q) => q + 1)} className="surface-sub fg-base h-10 w-10 text-ui">+</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="hairline border-t p-3">
              <button
                onClick={() => { addToCart(detail, detailQty); setDetail(null); }}
                className="btn btn-primary h-10 w-full"
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
