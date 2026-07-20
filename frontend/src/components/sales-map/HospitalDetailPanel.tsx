"use client";

import { useEffect, useState } from "react";
import {
  fetchEquipmentCatalog,
  fetchSalesNotes,
  createSalesNote,
  registerManualEquipment,
  updateManualEquipment,
  deleteManualEquipment,
} from "./api";
import { useAuth } from "@/context/AuthContext";
import { CATEGORY_LABEL, EquipmentCategory, HospitalDetail, SalesNoteItem } from "./types";

interface Props {
  detail: HospitalDetail | null;
  loading: boolean;
  category: EquipmentCategory;
  onClose: () => void;
  onEquipmentRegistered: () => void;
}

const CATS: EquipmentCategory[] = ["us", "xray", "ct", "mri", "bmd", "carm"];

export default function HospitalDetailPanel({ detail, loading, category, onClose, onEquipmentRegistered }: Props) {
  const [tab, setTab] = useState<EquipmentCategory>(category);
  const [notes, setNotes] = useState<SalesNoteItem[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualCatalog, setManualCatalog] = useState<{ manufacturer: string | null; model: string | null }[]>([]);
  const [manualMaker, setManualMaker] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualYear, setManualYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMaker, setEditMaker] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editYear, setEditYear] = useState(new Date().getFullYear());
  const [editCount, setEditCount] = useState(1);
  const { user } = useAuth();

  const hospitalId = detail?.hospital.id ?? null;

  useEffect(() => {
    if (!hospitalId) return;
    fetchSalesNotes(hospitalId).then(setNotes).catch(() => setNotes([]));
  }, [hospitalId]);

  // 영업지도 상단에서 선택한 카테고리가 바뀌거나 새 병원을 선택하면, 연도별 보유장비 탭도 자동으로 맞춘다
  useEffect(() => {
    setTab(category);
  }, [category, hospitalId]);

  useEffect(() => {
    if (!showManualForm) return;
    fetchEquipmentCatalog(tab).then(setManualCatalog).catch(() => setManualCatalog([]));
  }, [showManualForm, tab]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">불러오는 중...</div>;
  }
  if (!detail) return null;

  const { hospital, yearly_by_category } = detail;
  const yearly = yearly_by_category[tab] || [];

  async function submitNote() {
    if (!hospitalId || !noteText.trim()) return;
    setSaving(true);
    try {
      await createSalesNote({ hospital_id: hospitalId, visit_date: noteDate, content: noteText });
      setNoteText("");
      const updated = await fetchSalesNotes(hospitalId);
      setNotes(updated);
    } finally {
      setSaving(false);
    }
  }

  async function submitManualEquipment() {
    if (!hospitalId || !manualMaker || !manualModel) return;
    setSaving(true);
    try {
      await registerManualEquipment({
        hospital_id: hospitalId,
        category: tab,
        manufacturer: manualMaker,
        model: manualModel,
        year: manualYear,
      });
      setShowManualForm(false);
      setManualMaker("");
      setManualModel("");
      onEquipmentRegistered();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m: { id: number; manufacturer: string | null; model: string | null; eq_count: number }, year: number) {
    setEditingId(m.id);
    setEditMaker(m.manufacturer || "");
    setEditModel(m.model || "");
    setEditYear(year);
    setEditCount(m.eq_count);
  }

  async function saveEdit() {
    if (!editingId || !editMaker || !editModel) return;
    setSaving(true);
    try {
      await updateManualEquipment(editingId, { manufacturer: editMaker, model: editModel, year: editYear, eq_count: editCount });
      setEditingId(null);
      onEquipmentRegistered();
    } finally {
      setSaving(false);
    }
  }

  async function removeEquipment(id: number) {
    if (!confirm("이 장비 등록을 삭제하시겠습니까?")) return;
    setSaving(true);
    try {
      await deleteManualEquipment(id);
      onEquipmentRegistered();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative shrink-0 bg-brand-500 px-5 py-4 text-white">
        <button onClick={onClose} className="absolute right-3 top-3 text-white/80 hover:text-white">
          ✕
        </button>
        <div className="pr-6 text-base font-bold">
          {hospital.name}
          {hospital.is_member && (
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">회원가입 병원</span>
          )}
        </div>
        <div className="mt-1 text-xs text-white/75">
          {hospital.sido} {hospital.sigungu} · {hospital.type}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 px-4 pt-3 dark:border-gray-800">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold ${
              tab === c
                ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-400">연도별 보유 장비</span>
          <button
            onClick={() => setShowManualForm((v) => !v)}
            className="text-xs font-semibold text-brand-500 hover:underline"
          >
            + 직접 등록
          </button>
        </div>

        {showManualForm && (
          <div className="mb-3 space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
            <input
              list="manual-makers"
              value={manualMaker}
              onChange={(e) => setManualMaker(e.target.value)}
              placeholder="제조사"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <datalist id="manual-makers">
              {[...new Set(manualCatalog.map((c) => c.manufacturer).filter(Boolean))].map((m) => (
                <option key={m as string} value={m as string} />
              ))}
            </datalist>
            <input
              list="manual-models"
              value={manualModel}
              onChange={(e) => setManualModel(e.target.value)}
              placeholder="장비 모델"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <datalist id="manual-models">
              {manualCatalog
                .filter((c) => !manualMaker || c.manufacturer === manualMaker)
                .map((c) => (
                  <option key={c.model} value={c.model as string} />
                ))}
            </datalist>
            <input
              type="number"
              value={manualYear}
              onChange={(e) => setManualYear(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              onClick={submitManualEquipment}
              disabled={saving || !manualMaker || !manualModel}
              className="w-full rounded-lg bg-brand-500 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              등록 (즉시 지도에 반영)
            </button>
          </div>
        )}

        {yearly.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400 dark:bg-white/[0.02]">
            {CATEGORY_LABEL[tab]} 장비 이력 없음
          </div>
        ) : (
          <div className="space-y-2">
            {yearly.map((yr, i) => (
              <div
                key={yr.year}
                className={`rounded-lg border-l-4 p-2.5 ${
                  i === 0
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                    : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]"
                }`}
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    {yr.year}
                    {i === 0 ? " (현재)" : ""}
                  </span>
                  <span className="text-xs font-bold text-brand-500">총 {yr.total}대</span>
                </div>
                {yr.models.map((m, j) =>
                  editingId === m.id ? (
                    <div key={j} className="my-1 space-y-1 rounded-lg bg-white p-2 dark:bg-gray-900">
                      <input value={editMaker} onChange={(e) => setEditMaker(e.target.value)} placeholder="제조사" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
                      <input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="모델" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
                      <div className="flex gap-1">
                        <input type="number" value={editYear} onChange={(e) => setEditYear(Number(e.target.value))} className="w-1/2 rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
                        <input type="number" value={editCount} onChange={(e) => setEditCount(Number(e.target.value))} className="w-1/2 rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
                      </div>
                      <div className="flex gap-1">
                        <button onClick={saveEdit} disabled={saving} className="flex-1 rounded bg-brand-500 py-1 text-[11px] font-bold text-white">저장</button>
                        <button onClick={() => setEditingId(null)} className="flex-1 rounded bg-gray-100 py-1 text-[11px] dark:bg-white/10">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div key={j} className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {m.model} <span className="text-gray-400">· {m.manufacturer}</span>
                        {m.source === "manual" && (
                          <span className="ml-1 rounded bg-warning-50 px-1 text-[9px] text-warning-600 dark:bg-warning-500/15 dark:text-warning-400">
                            수동등록
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-bold text-brand-500">{m.eq_count}대</span>
                        {m.source === "manual" && (
                          <>
                            <button onClick={() => startEdit(m, yr.year)} className="text-gray-400 hover:text-brand-500">✏️</button>
                            <button onClick={() => removeEquipment(m.id)} className="text-gray-400 hover:text-error-500">×</button>
                          </>
                        )}
                      </span>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-gray-400">영업노트</div>
        <div className="space-y-2">
          {notes.length === 0 && <div className="text-xs text-gray-400">아직 노트가 없습니다</div>}
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border border-gray-100 bg-yellow-50/60 p-2.5 text-xs dark:border-gray-800 dark:bg-white/[0.02]">
              <div className="mb-1 text-[10px] text-gray-400">{n.visit_date || n.created_at?.slice(0, 10)}</div>
              <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{n.content}</div>
            </div>
          ))}
        </div>
        {user ? (
          <div className="mt-3 space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <input
              type="date"
              value={noteDate}
              onChange={(e) => setNoteDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="방문 내용, F/U 사항 등을 작성하세요"
              className="min-h-[60px] w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              onClick={submitNote}
              disabled={saving || !noteText.trim()}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              저장
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-center text-xs text-gray-400 dark:bg-white/[0.02]">
            영업노트 작성은 로그인이 필요합니다
          </div>
        )}
      </div>
    </div>
  );
}
