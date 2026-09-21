"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createDelivery, fetchStaff, StaffItem } from "./api";
import { SiteType } from "./types";

interface ItemRow {
  description: string;
  serial_no: string;
  price: string;
  sys_id: string;
}

// fixedSiteType이 주어지면(예: DEMO 관리 화면) 탭 전환 없이 해당 site_type으로 고정된다.
export default function DeliveryCreateClient({ fixedSiteType }: { fixedSiteType?: SiteType } = {}) {
  const router = useRouter();
  const [siteType, setSiteType] = useState<SiteType>(fixedSiteType ?? "delivery");
  const [form, setForm] = useState<Record<string, string>>({ hospital_type: "의원" });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", serial_no: "", price: "", sys_id: "" }]);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const isDemo = siteType === "demo";

  // DEMO 등록 폼의 담당자는 자유 텍스트 대신 송림 멤버 드롭다운으로 선택한다.
  useEffect(() => {
    if (isDemo) fetchStaff().then(setStaff);
  }, [isDemo]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const inputClass = "w-full field-auto";

  const field = (key: string, label: string, type = "text") => (
    <div>
      <label className="label-eyebrow mb-1 block">{label}</label>
      <input
        type={type}
        value={form[key] || ""}
        onChange={set(key)}
        // DEMO 날짜 필드는 캘린더 아이콘을 클릭해서도 고를 수 있어야 한다(전역 스타일이 기본 아이콘을 숨기므로 복원).
        className={type === "date" && isDemo ? `${inputClass} date-picker-visible` : inputClass}
      />
    </div>
  );

  async function submit() {
    if (!form.hospital_name?.trim()) {
      alert("병원명을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const d = await createDelivery({
        hospital_name: form.hospital_name,
        hospital_type: form.hospital_type,
        installation_date: form.installation_date,
        installation_location: form.installation_location,
        rep_doctor: form.rep_doctor,
        address: form.address,
        person_in_charge: form.person_in_charge,
        site_type: siteType,
        warranty_start: isDemo ? undefined : form.warranty_start,
        warranty_end: form.warranty_end,
        maintenance: isDemo ? undefined : form.maintenance,
        demo_result: isDemo ? form.demo_result : undefined,
        items: items
          .filter((it) => it.description.trim() || it.serial_no.trim())
          .map((it) => ({
            description: it.description || undefined,
            serial_no: it.serial_no || undefined,
            price: it.price ? Number(it.price) : undefined,
            sys_id: it.sys_id || undefined,
          })),
      });
      router.push(`/deliveries/${d.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="surface-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="card-title">
            {isDemo ? "🧪 새 DEMO 등록" : "🚚 새 납품 등록"}
          </h2>
          {!fixedSiteType && (
            <div className="seg">
              <button
                onClick={() => setSiteType("delivery")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${!isDemo ? "bg-brand-500 text-white" : "text-gray-500"}`}
              >
                납품 &amp; 관리
              </button>
              <button
                onClick={() => setSiteType("demo")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${isDemo ? "bg-brand-500 text-white" : "text-gray-500"}`}
              >
                DEMO
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("hospital_name", "병원명 *")}
          <div>
            <label className="label-eyebrow mb-1 block">구분</label>
            <select value={form.hospital_type || "의원"} onChange={set("hospital_type")} className={inputClass}>
              <option value="의원">의원</option>
              <option value="병원">병원</option>
              <option value="종합병원">종합병원</option>
            </select>
          </div>
          {field("installation_date", isDemo ? "DEMO 시작일자" : "설치일자", "date")}
          {field("installation_location", "설치장소")}
          {field("rep_doctor", "대표 원장")}
          {field("address", "주소")}
          {isDemo ? (
            <div>
              <label className="label-eyebrow mb-1 block">담당자</label>
              <select value={form.person_in_charge || ""} onChange={set("person_in_charge")} className={inputClass}>
                <option value="">선택 안 함</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.display_name}>{s.display_name}</option>
                ))}
              </select>
            </div>
          ) : (
            field("person_in_charge", "담당자")
          )}
          {isDemo ? (
            field("warranty_end", "DEMO 종료일자", "date")
          ) : (
            <>
              {field("warranty_start", "Warranty 시작", "date")}
            </>
          )}
          {!isDemo && field("warranty_end", "Warranty 종료", "date")}
          {isDemo ? (
            <div>
              <label className="label-eyebrow mb-1 block">DEMO 결과</label>
              <select value={form.demo_result || ""} onChange={set("demo_result")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="성공">성공</option>
                <option value="진행중">진행중</option>
                <option value="실패">실패</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="label-eyebrow mb-1 block">유지보수</label>
              <select value={form.maintenance || ""} onChange={set("maintenance")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="O">O (유지보수 대상)</option>
                <option value="X">X (해당 없음)</option>
              </select>
            </div>
          )}
        </div>

        <div className="mb-2 mt-5 text-xs font-medium uppercase text-gray-400">품목 목록</div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-ui">
          <thead>
            <tr className="border-b border-gray-200 text-left fg-subtle text-ui-sm dark:border-gray-800">
              <th className="py-1.5">Description</th>
              <th className="py-1.5">S/N</th>
              <th className="py-1.5">개별단가</th>
              <th className="py-1.5">SYSTEM ID</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                <td><input value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className="field-auto w-full px-1.5 py-0.5 text-ui-sm" /></td>
                <td><input value={it.serial_no} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, serial_no: e.target.value } : x)))} className="field-auto w-full px-1.5 py-0.5 text-ui-sm" /></td>
                <td><input type="number" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="field-auto w-full px-1.5 py-0.5 text-ui-sm" /></td>
                <td><input value={it.sys_id} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, sys_id: e.target.value } : x)))} className="field-auto w-full px-1.5 py-0.5 text-ui-sm" /></td>
                <td><button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-error-500">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <button
          onClick={() => setItems([...items, { description: "", serial_no: "", price: "", sys_id: "" }])}
          className="mt-2 text-xs font-semibold text-brand-500"
        >
          + 품목 추가
        </button>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => router.push(fixedSiteType === "demo" ? "/deliveries/demo" : "/deliveries")} className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold dark:border-gray-700">취소</button>
          <button onClick={submit} disabled={saving} className="rounded-full bg-brand-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
            {saving ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
