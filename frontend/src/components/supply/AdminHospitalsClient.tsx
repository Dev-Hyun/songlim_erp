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
    adminFetchPriceOverrides(hid).then(setOverrides);
  }

  const discountGrades = grades.filter((g) => g.grade_type === "discount");
  const giftGrades = grades.filter((g) => g.grade_type === "gift");

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-2">
      {hospitals.map((h) => (
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
                    <h4 className="mb-2 text-xs font-bold text-gray-500">회원가입 정보</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      <div><span className="text-gray-400">담당부서</span> {detail.hospital_dept || "-"}</div>
                      <div><span className="text-gray-400">전화</span> {detail.hospital_tel || "-"}</div>
                      <div><span className="text-gray-400">사업자번호</span> {detail.business_reg_no || "-"}</div>
                      <div><span className="text-gray-400">대표자</span> {detail.ceo_name || "-"}</div>
                      <div><span className="text-gray-400">대표자 연락처</span> {detail.ceo_phone || "-"}</div>
                      <div className="col-span-2 sm:col-span-3"><span className="text-gray-400">주소</span> {detail.hospital_address || "-"}</div>
                    </div>
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
                    <div className="mb-2 flex gap-2">
                      <select value={ovForm.catalog_id} onChange={(e) => setOvForm({ ...ovForm, catalog_id: e.target.value })} className={inputCls + " flex-1"}>
                        <option value="">품목 선택</option>
                        {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="number" value={ovForm.override_price} onChange={(e) => setOvForm({ ...ovForm, override_price: e.target.value })} placeholder="적용가" className={inputCls} />
                      <button onClick={() => addOverride(h.id)} className="rounded-lg bg-brand-500 px-3 text-xs font-bold text-white">설정</button>
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
                      <div className="flex flex-wrap gap-2">
                        {detail.equipment.map((e) => (
                          <span key={e.id} className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold dark:bg-white/10">
                            {EQUIPMENT_CATEGORY_LABEL[e.category] || e.category} · {e.manufacturer || "-"} {e.model || ""} ({e.year}, {e.eq_count}대{e.source === "manual" ? ", 수기등록" : ""})
                          </span>
                        ))}
                      </div>
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
    </div>
  );
}
