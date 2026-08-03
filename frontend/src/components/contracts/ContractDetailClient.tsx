"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  addComment,
  deleteComment,
  deleteContract,
  deletePhoto,
  fetchContractDetail,
  photoUrl,
  updateContract,
  uploadPhoto,
} from "./api";
import { ContractDetail, ContractItemRow, ContractStatus } from "./types";
import PhotoLightbox from "@/components/common/PhotoLightbox";

const STATUSES: ContractStatus[] = ["진행중", "보류", "완료"];
const STATUS_COLOR: Record<ContractStatus, string> = {
  진행중: "bg-warning-500",
  보류: "bg-gray-400",
  완료: "bg-success-500",
};

export default function ContractDetailClient({ id }: { id: number }) {
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string | number | null>>({});
  const [items, setItems] = useState<ContractItemRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [lightboxPhotoId, setLightboxPhotoId] = useState<number | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  function load() {
    fetchContractDetail(id).then((d) => {
      setDetail(d);
      setForm({ ...d.contract });
      setItems(d.items);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!detail) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  const c = detail.contract;
  const canEdit = !!user;

  async function setStatus(status: ContractStatus) {
    await updateContract(id, { status });
    load();
  }

  async function saveEdits() {
    await updateContract(id, {
      buyer_hospital: String(form.buyer_hospital || ""),
      buyer_biz_no: String(form.buyer_biz_no || ""),
      buyer_rep: String(form.buyer_rep || ""),
      contract_date: String(form.contract_date || ""),
      buyer_address: String(form.buyer_address || ""),
      buyer_phone: String(form.buyer_phone || ""),
      buyer_mobile: String(form.buyer_mobile || ""),
      buyer_fax: String(form.buyer_fax || ""),
      install_date: String(form.install_date || ""),
      sale_amount: Number(form.sale_amount || 0),
      sale_amount_note: String(form.sale_amount_note || ""),
      etc_note: String(form.etc_note || ""),
      customer_request: String(form.customer_request || ""),
      items: items.map((it) => ({ name: it.name, qty: it.qty || undefined, note: it.note || undefined })),
    });
    setEditing(false);
    load();
  }

  async function handleDelete() {
    if (!confirm("이 계약 건을 삭제하시겠습니까?")) return;
    await deleteContract(id);
    router.push("/contracts");
  }

  async function submitComment() {
    if (!commentText.trim()) return;
    await addComment(id, commentText);
    setCommentText("");
    load();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(id, file);
    load();
  }

  const field = (key: string, label: string, type = "text") => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-400">{label}</label>
      {editing ? (
        <input
          type={type}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      ) : (
        <div className="text-sm text-gray-700 dark:text-gray-300">{(c as unknown as Record<string, unknown>)[key] as string || "-"}</div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-white/90">📄 판매계약서</h2>
              <p className="text-xs text-gray-400">{c.buyer_hospital} · {c.updated_at?.slice(0, 10)}</p>
            </div>
            <div className="flex items-center gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold text-white ${c.status === s ? STATUS_COLOR[s] : "bg-gray-200 text-gray-500 dark:bg-white/10"}`}
                >
                  {s}
                </button>
              ))}
              {canEdit && (
                <>
                  {editing ? (
                    <button onClick={saveEdits} className="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">저장</button>
                  ) : (
                    <button onClick={() => setEditing(true)} className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold dark:border-gray-700">수정</button>
                  )}
                  <button onClick={handleDelete} className="rounded-full border border-error-300 px-3 py-1.5 text-xs font-semibold text-error-500">삭제</button>
                </>
              )}
            </div>
          </div>

          <div className="mb-2 text-xs font-bold uppercase text-gray-400">🏥 매수자 정보</div>
          <div className="grid grid-cols-2 gap-3">
            {field("buyer_hospital", "병원명")}
            {field("buyer_biz_no", "사업자등록번호")}
            {field("buyer_rep", "대표자명")}
            {field("contract_date", "계약일자", "date")}
            {field("buyer_phone", "전화번호")}
            {field("buyer_mobile", "휴대폰")}
            {field("buyer_fax", "팩스")}
            {field("install_date", "설치희망일", "date")}
          </div>
          <div className="mt-3">{field("buyer_address", "주소")}</div>

          <div className="mb-2 mt-5 text-xs font-bold uppercase text-gray-400">📦 계약 상품</div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
                <th className="py-1.5">상품명</th>
                <th className="py-1.5">수량</th>
                <th className="py-1.5">비고</th>
                {editing && <th />}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  {editing ? (
                    <>
                      <td><input value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><input value={it.qty || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><input value={it.note || ""} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
                      <td><button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-error-500">×</button></td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5">{it.name}</td>
                      <td className="py-1.5">{it.qty}</td>
                      <td className="py-1.5 text-gray-400">{it.note}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {editing && (
            <button
              onClick={() => setItems([...items, { id: -Date.now(), name: "", qty: "", note: "" }])}
              className="mt-2 text-xs font-semibold text-brand-500"
            >
              + 품목 추가
            </button>
          )}

          <div className="mb-2 mt-5 text-xs font-bold uppercase text-gray-400">💰 금액 / 요구사항</div>
          <div className="grid grid-cols-2 gap-3">
            {field("sale_amount", "판매금액", "number")}
            {field("sale_amount_note", "금액 비고")}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {field("customer_request", "고객요구사항")}
            {field("etc_note", "기타")}
          </div>
          {!editing && <div className="mt-2 text-xl font-bold text-brand-500">₩{c.sale_amount.toLocaleString()}</div>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase text-gray-400">
            <span>🖼️ 계약서 사진</span>
            <label className="cursor-pointer text-brand-500">
              + 사진 첨부
              <input type="file" accept="image/*,.heic,.heif,.pdf,application/pdf" className="hidden" onChange={handlePhotoUpload} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {detail.photos.map((p) => (
              <div key={p.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(id, p.id)}
                  alt=""
                  onClick={() => setLightboxPhotoId(p.id)}
                  className="h-24 w-full cursor-zoom-in rounded-lg object-cover"
                />
                <button
                  onClick={async () => { await deletePhoto(id, p.id); load(); }}
                  className="absolute right-1 top-1 hidden rounded-full bg-black/60 px-1.5 text-xs text-white group-hover:block"
                >
                  ×
                </button>
              </div>
            ))}
            {detail.photos.length === 0 && <div className="col-span-2 py-4 text-center text-xs text-gray-400">사진 없음</div>}
          </div>
        </div>

        {lightboxPhotoId != null && (
          <PhotoLightbox
            src={photoUrl(id, lightboxPhotoId)}
            filename={`${c.buyer_hospital || "계약서"}_사진.jpg`}
            onClose={() => setLightboxPhotoId(null)}
          />
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-2 text-xs font-bold uppercase text-gray-400">💬 진행 메모</div>
          <div className="mb-3 space-y-2">
            {detail.comments.map((cm) => (
              <div key={cm.id} className="rounded-lg bg-gray-50 p-2 text-xs dark:bg-white/[0.02]">
                <div className="mb-1 flex justify-between text-[10px] text-gray-400">
                  <span>{cm.created_at?.slice(0, 16)}</span>
                  {user && (user.id === cm.user_id || user.is_admin) && (
                    <button onClick={async () => { await deleteComment(id, cm.id); load(); }} className="text-error-500">삭제</button>
                  )}
                </div>
                <div className="text-gray-700 dark:text-gray-300">{cm.body}</div>
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
                placeholder="진행 메모를 남겨주세요"
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
