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

const inputCls = "field";

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

  function catalogLabel(c: AdminCatalogItem) {
    return `${c.manufacturer ? `(${c.manufacturer}) ` : ""}${c.name} / ${c.spec || "-"} / ${c.unit}`;
  }

  function pickOverrideCatalog(c: AdminCatalogItem) {
    setOvForm({ catalog_id: String(c.id), override_price: String(c.unit_price) });
    setOvSearch(catalogLabel(c));
  }

  const discountGrades = grades.filter((g) => g.grade_type === "discount");
  const giftGrades = grades.filter((g) => g.grade_type === "gift");

  if (loading) return <div className="empty-state">불러오는 중...</div>;

  const q = search.trim().toLowerCase();
  const visibleHospitals = q
    ? hospitals.filter((h) => `${h.hospital_name} ${h.hospital_type}`.toLowerCase().includes(q))
    : hospitals;

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="fg-subtle pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="병원명 또는 병원종별로 검색"
          className="field-lg w-full pl-9"
        />
      </div>
      {visibleHospitals.map((h) => (
        <div key={h.id} className="surface-card">
          <button onClick={() => openHospital(h.id)} className="row-hover flex w-full items-center justify-between gap-3 rounded-card px-3 py-2.5 text-left">
            <div className="min-w-0">
              <span className="fg-strong text-ui font-medium">{h.hospital_name}</span>
              <span className="chip-quiet ml-2">{h.hospital_type}</span>
            </div>
            <span className="fg-subtle text-ui-sm">{selected === h.id ? "접기 ▲" : "상세보기 ▼"}</span>
          </button>
          {selected === h.id && (
            <div className="hairline space-y-4 border-t p-4">
              {!detail ? (
                <div className="empty-state">불러오는 중...</div>
              ) : (
                <>
                  <div>
                    <h4 className="label-eyebrow mb-2 block">병원 정보</h4>
                    <div className="fg-base grid grid-cols-2 gap-x-4 gap-y-1.5 text-ui sm:grid-cols-3">
                      <div><span className="fg-subtle">병원종류</span> {detail.hospital_type}</div>
                      <div><span className="fg-subtle">담당부서</span> {detail.hospital_dept || "-"}</div>
                      <div><span className="fg-subtle">병원 전화</span> {detail.hospital_tel || "-"}</div>
                      <div><span className="fg-subtle">사업자번호</span> {detail.business_reg_no || "-"}</div>
                      <div><span className="fg-subtle">대표자</span> {detail.ceo_name || "-"}</div>
                      <div><span className="fg-subtle">대표자 연락처</span> {detail.ceo_phone || "-"}</div>
                      <div className="col-span-2 sm:col-span-3"><span className="fg-subtle">주소</span> {detail.hospital_address || "-"}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="label-eyebrow mb-2 block">담당자 계정 ({detail.contacts.length})</h4>
                    {detail.contacts.length === 0 ? (
                      <div className="fg-subtle text-ui-xs">등록된 담당자 계정이 없습니다.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.contacts.map((c) => (
                          <div key={c.username} className="surface-sub fg-base grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-control p-2 text-ui sm:grid-cols-4">
                            <div><span className="fg-subtle">이름</span> {c.display_name || "-"}</div>
                            <div><span className="fg-subtle">아이디</span> {c.username}</div>
                            <div><span className="fg-subtle">연락처</span> {c.phone || "-"}</div>
                            <div><span className="fg-subtle">이메일</span> {c.email || "-"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-eyebrow mb-1 block">할인 등급</label>
                      <select value={h.discount_grade_code || ""} onChange={(e) => setGrade(h, "discount_grade_code", e.target.value)} className={inputCls + " w-full"}>
                        <option value="">없음</option>
                        {discountGrades.map((g) => <option key={g.grade_code} value={g.grade_code}>{g.label} ({g.discount_rate}%)</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label-eyebrow mb-1 block">사은품 등급</label>
                      <select value={h.gift_grade_code || ""} onChange={(e) => setGrade(h, "gift_grade_code", e.target.value)} className={inputCls + " w-full"}>
                        <option value="">없음</option>
                        {giftGrades.map((g) => <option key={g.grade_code} value={g.grade_code}>{g.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label-eyebrow mb-1 block">품목별 전용 단가</label>
                    <div className="relative mb-2 flex gap-2">
                      <div className="relative flex-1">
                        <input
                          value={ovSearch}
                          onChange={(e) => { setOvSearch(e.target.value); setOvForm({ ...ovForm, catalog_id: "" }); }}
                          placeholder="품목명 검색"
                          className={inputCls + " w-full"}
                        />
                        {ovSearch && !ovForm.catalog_id && (
                          <div className="surface-card absolute z-10 mt-1 max-h-48 w-full overflow-y-auto shadow-lg">
                            {catalog.filter((c) => `${c.name} ${c.manufacturer || ""}`.includes(ovSearch)).slice(0, 20).map((c) => (
                              <button
                                key={c.id}
                                onClick={() => pickOverrideCatalog(c)}
                                className="row-hover fg-base block w-full px-3 py-1.5 text-left text-ui"
                              >
                                {catalogLabel(c)}
                              </button>
                            ))}
                            {catalog.filter((c) => `${c.name} ${c.manufacturer || ""}`.includes(ovSearch)).length === 0 && (
                              <div className="px-3 py-1.5 fg-subtle text-ui-sm">검색 결과 없음</div>
                            )}
                          </div>
                        )}
                      </div>
                      <input type="number" value={ovForm.override_price} onChange={(e) => setOvForm({ ...ovForm, override_price: e.target.value })} placeholder="적용가" className={inputCls} />
                      <button onClick={() => addOverride(h.id)} disabled={!ovForm.catalog_id} className="btn btn-default">설정</button>
                    </div>
                    {overrides.length === 0 ? (
                      <span className="fg-subtle text-ui-xs">설정된 전용 단가가 없습니다</span>
                    ) : (
                      <div className="hairline overflow-x-auto rounded-control border">
                        <table className="table-cards table-dense min-w-[520px]">
                          <thead>
                            <tr>
                              <th className="th-dense">품목명</th>
                              <th className="th-dense">제조사</th>
                              <th className="th-dense">규격</th>
                              <th className="th-dense">단위</th>
                              <th className="th-dense">기본가</th>
                              <th className="th-dense">적용가</th>
                              <th className="th-dense" />
                            </tr>
                          </thead>
                          <tbody>
                            {overrides.map((o) => {
                              const c = catalog.find((x) => x.id === o.catalog_id);
                              return (
                                <tr key={o.id} className="row-hover">
                                  <td data-label="품목명" className="td-dense fg-strong py-1.5 font-medium">{c?.name || `#${o.catalog_id}`}</td>
                                  <td data-label="제조사" className="td-dense fg-muted py-1.5">{c?.manufacturer || "-"}</td>
                                  <td data-label="규격" className="td-dense fg-muted py-1.5">{c?.spec || "-"}</td>
                                  <td data-label="단위" className="td-dense fg-muted py-1.5">{c?.unit || "-"}</td>
                                  <td data-label="기본가" className="td-dense fg-subtle py-1.5 tabular-nums">{c ? c.unit_price.toLocaleString() : "-"}원</td>
                                  <td data-label="적용가" className="td-dense py-1.5 font-medium tabular-nums text-success-600 dark:text-success-400">{o.override_price.toLocaleString()}원</td>
                                  <td className="td-dense py-1.5 text-right">
                                    <button onClick={async () => { await adminDeletePriceOverride(o.id); adminFetchPriceOverrides(h.id).then(setOverrides); }} className="text-ui font-medium text-error-600 hover:underline dark:text-error-400">삭제</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="label-eyebrow mb-2 block">보유 장비 (영업지도 연동)</h4>
                    {!detail.matched_hospital_id ? (
                      <div className="fg-subtle text-ui-xs">영업지도 병원 데이터와 연동되지 않은 계정입니다.</div>
                    ) : detail.equipment.length === 0 ? (
                      <div className="fg-subtle text-ui-xs">등록된 장비가 없습니다.</div>
                    ) : (
                      (() => {
                        const categories = Array.from(new Set(detail.equipment.map((e) => e.category)));
                        const activeCategory = eqCategory && categories.includes(eqCategory) ? eqCategory : categories[0];
                        const inCategory = detail.equipment.filter((e) => e.category === activeCategory);
                        const latestYear = Math.max(...inCategory.map((e) => e.year));
                        const current = inCategory.filter((e) => e.year === latestYear);
                        return (
                          <>
                            <div className="seg mb-2">
                              {categories.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() => setEqCategory(cat)}
                                  className={`seg-item ${activeCategory === cat ? "seg-item-on" : ""}`}
                                >
                                  {EQUIPMENT_CATEGORY_LABEL[cat] || cat}
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {current.map((e) => (
                                <span key={e.id} className="chip">
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
                    <h4 className="label-eyebrow mb-2 block">영업노트</h4>
                    {detail.sales_notes.length === 0 ? (
                      <div className="fg-subtle text-ui-xs">작성된 영업노트가 없습니다.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.sales_notes.map((n) => (
                          <div key={n.id} className="surface-sub rounded-control p-2 text-ui">
                            <div className="mb-0.5 fg-subtle text-ui-xs">{n.visit_date || "-"} · {n.created_by_name}</div>
                            <div className="fg-base whitespace-pre-wrap">{n.content}</div>
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
      {hospitals.length === 0 && <div className="empty-state">등록된 병원 계정이 없습니다</div>}
      {hospitals.length > 0 && visibleHospitals.length === 0 && (
        <div className="empty-state">&quot;{search}&quot; 검색 결과가 없습니다</div>
      )}
    </div>
  );
}
