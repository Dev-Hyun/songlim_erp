"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createContract } from "./api";

interface ItemRow {
  name: string;
  qty: string;
  note: string;
}

export default function ContractCreateClient() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemRow[]>([{ name: "", qty: "", note: "" }]);
  const [saving, setSaving] = useState(false);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const inputClass = "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900";

  const field = (key: string, label: string, type = "text") => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-400">{label}</label>
      <input type={type} value={form[key] || ""} onChange={set(key)} className={inputClass} />
    </div>
  );

  async function submit() {
    if (!form.buyer_hospital?.trim()) {
      alert("병원명을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const { id } = await createContract({
        buyer_hospital: form.buyer_hospital,
        buyer_biz_no: form.buyer_biz_no,
        buyer_rep: form.buyer_rep,
        contract_date: form.contract_date,
        buyer_address: form.buyer_address,
        buyer_phone: form.buyer_phone,
        buyer_mobile: form.buyer_mobile,
        buyer_fax: form.buyer_fax,
        install_date: form.install_date,
        sale_amount: form.sale_amount ? Number(form.sale_amount) : 0,
        sale_amount_note: form.sale_amount_note,
        etc_note: form.etc_note,
        customer_request: form.customer_request,
        items: items.filter((it) => it.name.trim()).map((it) => ({ name: it.name, qty: it.qty || undefined, note: it.note || undefined })),
      });
      router.push(`/contracts/${id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-4 text-lg font-bold text-gray-800 dark:text-white/90">📄 새 계약 건 등록</h2>

        <div className="mb-2 text-xs font-bold uppercase text-gray-400">🏥 매수자 정보</div>
        <div className="grid grid-cols-2 gap-3">
          {field("buyer_hospital", "병원명 *")}
          {field("buyer_biz_no", "사업자등록번호")}
          {field("buyer_rep", "대표자명")}
          {field("contract_date", "계약일자", "date")}
          {field("buyer_phone", "전화번호")}
          {field("buyer_mobile", "휴대폰")}
          {field("buyer_fax", "팩스")}
          {field("install_date", "설치희망일", "date")}
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-gray-400">주소</label>
          <textarea value={form.buyer_address || ""} onChange={set("buyer_address")} className={inputClass} />
        </div>

        <div className="mb-2 mt-5 text-xs font-bold uppercase text-gray-400">📦 계약 상품</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
                <th className="py-1.5">상품명</th>
                <th className="py-1.5">수량</th>
                <th className="py-1.5">비고</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  <td><input value={it.name} placeholder="상품명" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                  <td><input value={it.qty} placeholder="예: 1 Set" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                  <td><input value={it.note} placeholder="비고" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                  <td><button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-error-500">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => setItems([...items, { name: "", qty: "", note: "" }])} className="mt-2 text-xs font-semibold text-brand-500">
          + 품목 추가
        </button>

        <div className="mb-2 mt-5 text-xs font-bold uppercase text-gray-400">💰 금액 / 요구사항</div>
        <div className="grid grid-cols-2 gap-3">
          {field("sale_amount", "판매금액(원)", "number")}
          {field("sale_amount_note", "금액 비고")}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">고객요구사항</label>
            <textarea value={form.customer_request || ""} onChange={set("customer_request")} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">기타</label>
            <textarea value={form.etc_note || ""} onChange={set("etc_note")} className={inputClass} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => router.push("/contracts")} className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold dark:border-gray-700">취소</button>
          <button onClick={submit} disabled={saving} className="rounded-full bg-brand-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {saving ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
