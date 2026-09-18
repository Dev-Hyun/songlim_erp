"use client";

import { useEffect, useState } from "react";
import { localISODate } from "@/lib/date";
import {
  fetchEquipmentCatalog,
  fetchSalesNotes,
  createSalesNote,
  updateSalesNote,
  deleteSalesNote,
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
  const [noteDate, setNoteDate] = useState(() => localISODate());
  const [noteEditingId, setNoteEditingId] = useState<number | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [noteEditDate, setNoteEditDate] = useState("");
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
    return <div className="empty-state">불러오는 중...</div>;
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

  async function saveNoteEdit() {
    if (!hospitalId || noteEditingId == null || !noteEditText.trim()) return;
    await updateSalesNote(noteEditingId, { content: noteEditText.trim(), visit_date: noteEditDate || null });
    setNoteEditingId(null);
    setNotes(await fetchSalesNotes(hospitalId));
  }

  async function removeNote(id: number) {
    if (!hospitalId || !confirm("이 영업노트를 삭제하시겠습니까?")) return;
    await deleteSalesNote(id);
    setNotes(await fetchSalesNotes(hospitalId));
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
      <div className="hairline relative shrink-0 border-b px-4 py-3">
        <button onClick={onClose} className="icon-btn absolute right-2 top-2">
          ✕
        </button>
        <div className="card-title pr-8">
          {hospital.name}
          {hospital.is_member && (
            <span className="chip ml-2 align-middle"><span className="dot bg-success-500" />회원가입 병원</span>
          )}
        </div>
        <div className="fg-muted mt-1 text-ui-sm">
          {hospital.sido} {hospital.sigungu} · {hospital.type}
        </div>
        {hospital.address && <div className="fg-subtle mt-0.5 text-ui-sm">{hospital.address}</div>}
      </div>

      <div className="hairline flex gap-1 overflow-x-auto border-b px-3 pt-2">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`shrink-0 whitespace-nowrap rounded-t-[6px] px-2.5 py-1.5 text-ui font-medium transition-colors ${
              tab === c
                ? "surface-inset fg-strong"
                : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-eyebrow">연도별 보유 장비</span>
          <button
            onClick={() => setShowManualForm((v) => !v)}
            className="btn btn-default h-7"
          >
            + 직접 등록
          </button>
        </div>

        {showManualForm && (
          <div className="surface-sub hairline mb-3 space-y-2 rounded-card border p-3">
            <input
              list="manual-makers"
              value={manualMaker}
              onChange={(e) => setManualMaker(e.target.value)}
              placeholder="제조사"
              className="field-auto w-full"
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
              className="field-auto w-full"
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
              className="field-auto w-full"
            />
            <button
              onClick={submitManualEquipment}
              disabled={saving || !manualMaker || !manualModel}
              className="btn btn-default w-full"
            >
              등록 (즉시 지도에 반영)
            </button>
          </div>
        )}

        {yearly.length === 0 ? (
          <div className="surface-sub fg-subtle rounded-control p-3 text-ui-sm">
            {CATEGORY_LABEL[tab]} 장비 이력 없음
          </div>
        ) : (
          <div className="space-y-2">
            {yearly.map((yr, i) => (
              <div
                key={yr.year}
                className={`surface-sub rounded-control border-l-4 p-2.5 ${
                  i === 0
                    ? "border-gray-900 dark:border-white/50"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="fg-base text-ui font-medium tabular-nums">
                    {yr.year}
                    {i === 0 ? " (현재)" : ""}
                  </span>
                  <span className="fg-strong text-ui font-medium tabular-nums">총 {yr.total}대</span>
                </div>
                {yr.models.map((m, j) =>
                  editingId === m.id ? (
                    <div key={j} className="surface-card my-1 space-y-1 p-2">
                      <input value={editMaker} onChange={(e) => setEditMaker(e.target.value)} placeholder="제조사" className="field-auto w-full px-1.5 py-0.5 text-ui-sm" />
                      <input value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="모델" className="field-auto w-full px-1.5 py-0.5 text-ui-sm" />
                      <div className="flex gap-1">
                        <input type="number" value={editYear} onChange={(e) => setEditYear(Number(e.target.value))} className="field-auto w-1/2 px-1.5 py-0.5 text-ui-sm" />
                        <input type="number" value={editCount} onChange={(e) => setEditCount(Number(e.target.value))} className="field-auto w-1/2 px-1.5 py-0.5 text-ui-sm" />
                      </div>
                      <div className="flex gap-1">
                        <button onClick={saveEdit} disabled={saving} className="btn btn-default h-7 flex-1">저장</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-ghost h-7 flex-1">취소</button>
                      </div>
                    </div>
                  ) : (
                    <div key={j} className="flex justify-between gap-2 text-ui">
                      <span className="fg-base min-w-0 font-medium">
                        {m.model} <span className="fg-subtle">· {m.manufacturer}</span>
                        {m.source === "manual" && (
                          <span className="chip-quiet ml-1">
                            수동등록
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="fg-strong font-medium tabular-nums">{m.eq_count}대</span>
                        {m.source === "manual" && (
                          <>
                            <button onClick={() => startEdit(m, yr.year)} className="fg-subtle hover:text-gray-700 dark:hover:text-gray-200">✏️</button>
                            <button onClick={() => removeEquipment(m.id)} className="fg-subtle hover:text-error-500">×</button>
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

        <div className="label-eyebrow mb-2 mt-5">영업노트</div>
        <div className="space-y-2">
          {notes.length === 0 && <div className="fg-subtle text-ui-sm">아직 노트가 없습니다</div>}
          {notes.map((n) => (
            <div key={n.id} className="surface-sub hairline rounded-control border p-2.5 text-ui">
              {noteEditingId === n.id ? (
                <div className="space-y-1.5">
                  <input
                    type="date"
                    value={noteEditDate}
                    onChange={(e) => setNoteEditDate(e.target.value)}
                    className="field"
                  />
                  <textarea
                    value={noteEditText}
                    onChange={(e) => setNoteEditText(e.target.value)}
                    className="field-auto min-h-[54px] w-full"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setNoteEditingId(null)} className="btn btn-ghost h-7">
                      취소
                    </button>
                    <button onClick={saveNoteEdit} className="btn btn-default h-7">
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="fg-subtle text-ui-xs tabular-nums">{n.visit_date || n.created_at?.slice(0, 10)}</span>
                    {user && n.user_id === user.id && (
                      <span className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setNoteEditingId(n.id);
                            setNoteEditText(n.content);
                            setNoteEditDate(n.visit_date || "");
                          }}
                          className="fg-muted text-ui-xs font-medium hover:underline"
                        >
                          수정
                        </button>
                        <button onClick={() => removeNote(n.id)} className="text-ui-xs font-medium text-error-600 hover:underline dark:text-error-400">
                          삭제
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="fg-base whitespace-pre-wrap text-ui">{n.content}</div>
                </>
              )}
            </div>
          ))}
        </div>
        {user ? (
          <div className="surface-sub hairline mt-3 space-y-2 rounded-card border p-3">
            <input
              type="date"
              value={noteDate}
              onChange={(e) => setNoteDate(e.target.value)}
              className="field"
            />
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="방문 내용, F/U 사항 등을 작성하세요"
              className="field-auto min-h-[60px] w-full"
            />
            <button
              onClick={submitNote}
              disabled={saving || !noteText.trim()}
              className="btn btn-primary"
            >
              저장
            </button>
          </div>
        ) : (
          <div className="surface-sub fg-subtle mt-3 rounded-card p-3 text-center text-ui-sm">
            영업노트 작성은 로그인이 필요합니다
          </div>
        )}
      </div>
    </div>
  );
}
