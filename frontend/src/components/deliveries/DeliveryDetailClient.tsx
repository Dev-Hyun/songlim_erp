"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { addComment, fetchDeliveryDetail, photoUrl, updateDelivery, uploadPhoto } from "./api";
import { DeliveryDetail, DeliveryItemRow } from "./types";

export default function DeliveryDetailClient({ id }: { id: number }) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [items, setItems] = useState<DeliveryItemRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const { user } = useAuth();

  function load() {
    fetchDeliveryDetail(id).then((d) => {
      setDetail(d);
      setForm({
        hospital_name: d.delivery.hospital_name,
        hospital_type: d.delivery.hospital_type || "의원",
        installation_date: d.delivery.installation_date || "",
        installation_location: d.delivery.installation_location || "",
        rep_doctor: d.delivery.rep_doctor || "",
        address: d.delivery.address || "",
        person_in_charge: d.delivery.person_in_charge || "",
        warranty_start: d.delivery.warranty_start || "",
        warranty_end: d.delivery.warranty_end || "",
        maintenance: d.delivery.maintenance || "",
        demo_result: d.delivery.demo_result || "",
      });
      setItems(d.items);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!detail) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;
  const d = detail.delivery;
  const isDemo = d.site_type === "demo";

  async function saveEdits() {
    await updateDelivery(id, {
      hospital_name: form.hospital_name,
      hospital_type: form.hospital_type,
      installation_date: form.installation_date,
      installation_location: form.installation_location,
      rep_doctor: form.rep_doctor,
      address: form.address,
      person_in_charge: form.person_in_charge,
      warranty_start: isDemo ? undefined : form.warranty_start,
      warranty_end: form.warranty_end,
      maintenance: isDemo ? undefined : form.maintenance,
      demo_result: isDemo ? form.demo_result : undefined,
      items: items.map((it) => ({
        description: it.description || undefined,
        serial_no: it.serial_no || undefined,
        price: it.price ?? undefined,
        sys_id: it.sys_id || undefined,
      })),
    });
    setEditing(false);
    load();
  }

  async function submitComment() {
    if (!commentText.trim()) return;
    await addComment(id, commentText);
    setCommentText("");
    load();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadPhoto(id, file);
    }
    load();
  }

  const inputClass = "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900";

  const field = (key: string, label: string, type = "text") => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-400">{label}</label>
      {editing ? (
        <input type={type} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
      ) : (
        <div className="text-sm text-gray-700 dark:text-gray-300">{(d as unknown as Record<string, unknown>)[key] as string || "-"}</div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white/90">🔬 초음파 계약/납품 현황</h2>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold text-white ${isDemo ? "bg-brand-500" : "bg-success-500"}`}
              >
                {isDemo ? "DEMO" : "납품 & 관리"}
              </span>
              {editing ? (
                <button onClick={saveEdits} className="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">저장</button>
              ) : (
                <button onClick={() => setEditing(true)} className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold dark:border-gray-700">수정</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field("hospital_name", "병원명")}
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-400">구분</label>
              {editing ? (
                <select value={form.hospital_type || "의원"} onChange={(e) => setForm({ ...form, hospital_type: e.target.value })} className={inputClass}>
                  <option value="의원">의원</option>
                  <option value="병원">병원</option>
                  <option value="종합병원">종합병원</option>
                </select>
              ) : (
                <div className="text-sm text-gray-700 dark:text-gray-300">{d.hospital_type || "-"}</div>
              )}
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
          </div>

          {isDemo ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-gray-400">DEMO 결과</label>
              {editing ? (
                <select value={form.demo_result || ""} onChange={(e) => setForm({ ...form, demo_result: e.target.value })} className={inputClass}>
                  <option value="">선택 안 함</option>
                  <option value="예정">예정</option>
                  <option value="진행중">진행중</option>
                  <option value="성공">성공</option>
                  <option value="실패">실패</option>
                </select>
              ) : (
                <div className="text-sm text-gray-700 dark:text-gray-300">{d.demo_result || "-"}</div>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-gray-400">유지보수</label>
              {editing ? (
                <select value={form.maintenance || ""} onChange={(e) => setForm({ ...form, maintenance: e.target.value })} className={inputClass}>
                  <option value="">선택 안 함</option>
                  <option value="O">O (유지보수 대상)</option>
                  <option value="X">X (해당 없음)</option>
                </select>
              ) : (
                <div className="text-sm text-gray-700 dark:text-gray-300">{d.maintenance || "-"}</div>
              )}
            </div>
          )}

          <div className="mb-2 mt-5 text-xs font-bold uppercase text-gray-400">장비 품목</div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
                <th className="py-1.5">Description</th>
                <th className="py-1.5">S/N</th>
                <th className="py-1.5">개별단가</th>
                <th className="py-1.5">SYSTEM ID</th>
                {editing && <th />}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  {editing ? (
                    <>
                      <td><input value={it.description || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><input value={it.serial_no || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, serial_no: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><input type="number" value={it.price ?? ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value ? Number(e.target.value) : null } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><input value={it.sys_id || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, sys_id: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-error-500">×</button></td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5">{it.description}</td>
                      <td className="py-1.5 text-gray-400">{it.serial_no}</td>
                      <td className="py-1.5 text-gray-400">{it.price != null ? it.price.toLocaleString() : "-"}</td>
                      <td className="py-1.5 text-gray-400">{it.sys_id}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {editing && (
            <button
              onClick={() => setItems([...items, { id: -Date.now(), description: "", serial_no: "", price: null, sys_id: "" }])}
              className="mt-2 text-xs font-semibold text-brand-500"
            >
              + 품목 추가
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase text-gray-400">
            <span>🖼️ 사진</span>
            <label className="cursor-pointer text-brand-500">
              + 사진 첨부
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {detail.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={photoUrl(id, p.id)} alt="" className="h-24 w-full rounded-lg object-cover" />
            ))}
            {detail.photos.length === 0 && <div className="col-span-2 py-4 text-center text-xs text-gray-400">사진 없음</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-2 text-xs font-bold uppercase text-gray-400">💬 메모</div>
          <div className="mb-3 space-y-2">
            {detail.comments.map((cm) => (
              <div key={cm.id} className="rounded-lg bg-gray-50 p-2 text-xs dark:bg-white/[0.02]">
                <div className="mb-1 text-[10px] text-gray-400">{cm.created_at?.slice(0, 16)}</div>
                <div className="text-gray-700 dark:text-gray-300">{cm.content}</div>
              </div>
            ))}
            {detail.comments.length === 0 && <div className="text-xs text-gray-400">메모 없음</div>}
          </div>
          {user ? (
            <div className="space-y-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[60px] w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
              />
              <button onClick={submitComment} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">등록</button>
            </div>
          ) : (
            <div className="text-center text-xs text-gray-400">로그인이 필요합니다</div>
          )}
        </div>
      </div>
    </div>
  );
}
