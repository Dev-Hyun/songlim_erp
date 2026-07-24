"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDelivery } from "./api";
import { SiteType } from "./types";

interface ItemRow {
  description: string;
  serial_no: string;
  price: string;
  sys_id: string;
}

export default function DeliveryCreateClient() {
  const router = useRouter();
  const [siteType, setSiteType] = useState<SiteType>("delivery");
  const [form, setForm] = useState<Record<string, string>>({ hospital_type: "의원" });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", serial_no: "", price: "", sys_id: "" }]);
  const [saving, setSaving] = useState(false);
  const isDemo = siteType === "demo";

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const inputClass = "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900";

  const field = (key: string, label: string, type = "text") => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-400">{label}</label>
      <input type={type} value={form[key] || ""} onChange={set(key)} className={inputClass} />
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
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white/90">
            {isDemo ? "🧪 새 DEMO 등록" : "🚚 새 납품 등록"}
          </h2>
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
            <button
              onClick={() => setSiteType("delivery")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${!isDemo ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              납품 &amp; 관리
            </button>
            <button
              onClick={() => setSiteType("demo")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${isDemo ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              DEMO
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("hospital_name", "병원명 *")}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">구분</label>
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
          {field("person_in_charge", "담당자")}
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
              <label className="mb-1 block text-xs font-semibold text-gray-400">DEMO 결과</label>
              <select value={form.demo_result || ""} onChange={set("demo_result")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="성공">성공</option>
                <option value="진행중">진행중</option>
                <option value="실패">실패</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-400">유지보수</label>
              <select value={form.maintenance || ""} onChange={set("maintenance")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="O">O (유지보수 대상)</option>
                <option value="X">X (해당 없음)</option>
              </select>
            </div>
          )}
        </div>

        <div className="mb-2 mt-5 text-xs font-bold uppercase text-gray-400">품목 목록</div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
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
                <td><input value={it.description} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                <td><input value={it.serial_no} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, serial_no: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                <td><input type="number" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                <td><input value={it.sys_id} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, sys_id: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
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
          <button onClick={() => router.push("/deliveries")} className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold dark:border-gray-700">취소</button>
          <button onClick={submit} disabled={saving} className="rounded-full bg-brand-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {saving ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
