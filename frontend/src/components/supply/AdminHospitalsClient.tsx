"use client";

import { useEffect, useState } from "react";
import {
  AdminCatalogItem,
  AdminHospital,
  GradeRow,
  HospitalDetail,
  PriceOverride,
  adminFetchCatalog,
  adminFetchHospitalDetail,
  adminFetchHospitals,
  adminFetchPriceOverrides,
  adminSetHospitalGrades,
  adminUpsertPriceOverride,
  adminDeletePriceOverride,
  fetchGrades,
} from "./api";

const inputCls = "rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900";

const EQUIPMENT_CATEGORY_LABEL: Record<string, string> = {
  us: "초음파", xray: "X-ray", ct: "CT", mri: "MRI", bmd: "골밀도", carm: "C-Arm",
};

export default function AdminHospitalsClient() {
  const [hospitals, setHospitals] = useState<AdminHospital[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<HospitalDetail | null>(null);
  const [overrides, setOverrides] = useState<PriceOverride[]>([]);
  const [ovForm, setOvForm] = useState({ catalog_id: "", override_price: "" });
  const [ovSearch, setOvSearch] = useState("");
  const [eqCategory, setEqCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    Promise.all([adminFetchHospitals(), fetchGrades(), adminFetchCatalog()])
      .then(([h, g, c]) => { setHospitals(h); setGrades(g); setCatalog(c); })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function openHospital(hid: number) {
    const next = selected === hid ? null : hid;
    setSelected(next);
    setEqCategory(null);
    setOvSearch("");
    if (next) {
      adminFetchHospitalDetail(next).then(setDetail);
      adminFetchPriceOverrides(next).then(setOverrides);
    } else {
      setDetail(null);
    }
  }

  async function setGrade(h: AdminHospital, key: "discount_grade_code" | "gift_grade_code", value: string) {
    const payload = {
      discount_grade_code: key === "discount_grade_code" ? (value || null) : h.discount_grade_code,
      gift_grade_code: key === "gift_grade_code" ? (value || null) : h.gift_grade_code,
    };
    await adminSetHospitalGrades(h.id, payload);
    load();
  }

  async function addOverride(hid: number) {
    if (!ovForm.catalog_id || !ovForm.override_price) return;
    await adminUpsertPriceOverride({ catalog_id: Number(ovForm.catalog_id), hospital_profile_id: hid, override_price: Number(ovForm.override_price) });
    setOvForm({ catalog_id: "", override_price: "" });
    setOvSearch("");
    adminFetchPriceOverrides(hid).then(setOverrides);
  }

  function pickOverrideCatalog(c: AdminCatalogItem) {
    setOvForm({ ...ovForm, catalog_id: String(c.id) });
    setOvSearch(c.name);
  }

  const discountGrades = grades.filter((g) => g.grade_type === "discount");
  const giftGrades = grades.filter((g) => g.grade_type === "gift");

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  const q = search.trim().toLowerCase();
  const visibleHospitals = q
    ? hospitals.filter((h) => `${h.hospital_name} ${h.hospital_type}`.toLowerCase().includes(q))
    : hospitals;

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="병원명 또는 병원종별로 검색"
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      {visibleHospitals.map((h) => (
        <div key={h.id} className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <button onClick={() => openHospital(h.id)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <div>
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{h.hospital_name}</span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-white/10">{h.hospital_type}</span>
            </div>
            <span className="text-xs text-gray-400">{selected === h.id ? "접기 ▲" : "상세보기 ▼"}</span>
          </button>
          {selected === h.id && (
            <div className="space-y-4 border-t border-gray-100 p-4 dark:border-gray-800">
              {!detail ? (
                <div className="py-4 text-center text-xs text-gray-400">불러오는 중...</div>
              ) : (
                <>
                  <div>
                    <h4 className="mb-2 text-xs font-bold text-gray-500">병원 정보</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      <div><span className="text-gray-400">병원종류</span> {detail.hospital_type}</div>
                      <div><span className="text-gray-400">담당부서</span> {detail.hospital_dept || "-"}</div>
                      <div><span className="text-gray-400">병원 전화</span> {detail.hospital_tel || "-"}</div>
                      <div><span className="text-gray-400">사업자번호</span> {detail.business_reg_no || "-"}</div>
                      <div><span className="text-gray-400">대표자</span> {detail.ceo_name || "-"}</div>
                      <div><span className="text-gray-400">대표자 연락처</span> {detail.ceo_phone || "-"}</div>
                      <div className="col-span-2 sm:col-span-3"><span className="text-gray-400">주소</span> {detail.hospital_address || "-"}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-gray-500">담당자 계정 ({detail.contacts.length})</h4>
                    {detail.contacts.length === 0 ? (
                      <div className="text-[11px] text-gray-400">등록된 담당자 계정이 없습니다.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.contacts.map((c) => (
                          <div key={c.username} className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-gray-50 p-2 text-xs dark:bg-white/[0.03] sm:grid-cols-4">
                            <div><span className="text-gray-400">이름</span> {c.display_name || "-"}</div>
                            <div><span className="text-gray-400">아이디</span> {c.username}</div>
                            <div><span className="text-gray-400">연락처</span> {c.phone || "-"}</div>
                            <div><span className="text-gray-400">이메일</span> {c.email || "-"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

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
                    <label className="mb-1 block text-[11px] font-semibold text-gray-400">품목별 전용 단가</label>
                    <div className="relative mb-2 flex gap-2">
                      <div className="relative flex-1">
                        <input
                          value={ovSearch}
                          onChange={(e) => { setOvSearch(e.target.value); setOvForm({ ...ovForm, catalog_id: "" }); }}
                          placeholder="품목명 검색"
                          className={inputCls + " w-full"}
                        />
                        {ovSearch && !ovForm.catalog_id && (
                          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                            {catalog.filter((c) => c.name.includes(ovSearch)).slice(0, 20).map((c) => (
                              <button
                                key={c.id}
                                onClick={() => pickOverrideCatalog(c)}
                                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-white/5"
                              >
                                {c.name}
                              </button>
                            ))}
                            {catalog.filter((c) => c.name.includes(ovSearch)).length === 0 && (
                              <div className="px-3 py-1.5 text-xs text-gray-400">검색 결과 없음</div>
                            )}
                          </div>
                        )}
                      </div>
                      <input type="number" value={ovForm.override_price} onChange={(e) => setOvForm({ ...ovForm, override_price: e.target.value })} placeholder="적용가" className={inputCls} />
                      <button onClick={() => addOverride(h.id)} disabled={!ovForm.catalog_id} className="rounded-lg bg-brand-500 px-3 text-xs font-bold text-white disabled:opacity-50">설정</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {overrides.map((o) => {
                        const c = catalog.find((x) => x.id === o.catalog_id);
                        return (
                          <span key={o.id} className="flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-[11px] font-semibold text-success-600 dark:bg-success-500/15 dark:text-success-400">
                            {c?.name || `#${o.catalog_id}`}: {o.override_price.toLocaleString()}원
                            <button onClick={async () => { await adminDeletePriceOverride(o.id); adminFetchPriceOverrides(h.id).then(setOverrides); }} className="text-error-500">×</button>
                          </span>
                        );
                      })}
                      {overrides.length === 0 && <span className="text-[11px] text-gray-400">설정된 전용 단가가 없습니다</span>}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-gray-500">보유 장비 (영업지도 연동)</h4>
                    {!detail.matched_hospital_id ? (
                      <div className="text-[11px] text-gray-400">영업지도 병원 데이터와 연동되지 않은 계정입니다.</div>
                    ) : detail.equipment.length === 0 ? (
                      <div className="text-[11px] text-gray-400">등록된 장비가 없습니다.</div>
                    ) : (
                      (() => {
                        const categories = Array.from(new Set(detail.equipment.map((e) => e.category)));
                        const activeCategory = eqCategory && categories.includes(eqCategory) ? eqCategory : categories[0];
                        const inCategory = detail.equipment.filter((e) => e.category === activeCategory);
                        const latestYear = Math.max(...inCategory.map((e) => e.year));
                        const current = inCategory.filter((e) => e.year === latestYear);
                        return (
                          <>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {categories.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() => setEqCategory(cat)}
                                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                                    activeCategory === cat ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"
                                  }`}
                                >
                                  {EQUIPMENT_CATEGORY_LABEL[cat] || cat}
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {current.map((e) => (
                                <span key={e.id} className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold dark:bg-white/10">
                                  {e.manufacturer || "-"} {e.model || ""} ({e.year}, {e.eq_count}대{e.source === "manual" ? ", 수기등록" : ""})
                                </span>
                              ))}
                            </div>
                          </>
                        );
                      })()
                    )}
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-bold text-gray-500">영업노트</h4>
                    {detail.sales_notes.length === 0 ? (
                      <div className="text-[11px] text-gray-400">작성된 영업노트가 없습니다.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.sales_notes.map((n) => (
                          <div key={n.id} className="rounded-lg bg-gray-50 p-2 text-xs dark:bg-white/[0.03]">
                            <div className="mb-0.5 text-[11px] text-gray-400">{n.visit_date || "-"} · {n.created_by_name}</div>
                            <div className="text-gray-700 dark:text-gray-300">{n.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {hospitals.length === 0 && <div className="p-8 text-center text-sm text-gray-400">등록된 병원 계정이 없습니다</div>}
      {hospitals.length > 0 && visibleHospitals.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-400">&quot;{search}&quot; 검색 결과가 없습니다</div>
      )}
    </div>
  );
}
