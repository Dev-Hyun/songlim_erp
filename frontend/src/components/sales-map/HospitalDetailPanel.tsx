"use client";

import { ReactNode, useEffect, useState } from "react";
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
import {
  CATEGORY_LABEL,
  EquipmentCategory,
  HospitalDetail,
  LicenseInfo,
  REPLACE_SOON_YEARS,
  SalesNoteItem,
  YearlyEquipment,
  tenureLabel,
} from "./types";

interface Props {
  detail: HospitalDetail | null;
  loading: boolean;
  category: EquipmentCategory;
  onClose: () => void;
  onEquipmentRegistered: () => void;
}

const CATS: EquipmentCategory[] = ["us", "xray", "ct", "mri", "bmd", "carm"];

// 식약처 의료기기안심책방 검색 — 서버에서 조회가 안 되는 사이트라 링크만 건다(허가번호로 직접 검색)
const EMEDI_SEARCH_URL = "https://emedi.mfds.go.kr/search/data/MNU20237";

type EquipRowData = YearlyEquipment["models"][number];

// 장비 한 줄: 모델 · 제조사 · 대수, 그 아래 보유 기간과 접힌 식약처 허가 정보
function EquipRow({
  m,
  license,
  open,
  onToggle,
  actions,
}: {
  m: EquipRowData;
  license: LicenseInfo | undefined;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
}) {
  const tenure = tenureLabel(m);
  // 제조사는 정리된 brand(maker)만 쓴다. manufacturer 원문은 구성품(디텍터) 회사나 겹치는 허가번호의 업체일 수 있어
  // apply_brand.py 가 일부러 비워 둔 칸을 되살리게 된다 — 직원이 적은 수동 등록만 원문을 그대로 보여 준다.
  const maker = m.maker ?? (m.source === "manual" ? m.manufacturer : null);
  return (
    <div className="py-0.5 text-ui">
      <div className="flex justify-between gap-2">
        <span className="fg-base min-w-0 font-medium">
          {m.model} {maker && <span className="fg-subtle">· {maker}</span>}
          {m.source === "manual" && <span className="chip-quiet ml-1">수동등록</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="fg-strong font-medium tabular-nums">{m.eq_count}대</span>
          {actions}
        </span>
      </div>
      {(tenure || m.license_no) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-ui-xs">
          {tenure && (
            <span className="fg-muted tabular-nums">
              {m.since_year}년{m.tenure_capped ? " 이전" : ""}부터 {tenure}
            </span>
          )}
          {(m.tenure_years ?? 0) >= REPLACE_SOON_YEARS && (
            <span className="chip"><span className="dot bg-warning-500" />교체 시기</span>
          )}
          {m.license_no && (
            <button onClick={onToggle} className="chip-quiet hover:text-gray-800 dark:hover:text-gray-200" aria-expanded={open}>
              {license?.origin ?? "식약처"} 허가
              {license?.revoked && <span className="dot bg-error-500" />}
              <span aria-hidden>{open ? "▴" : "▾"}</span>
            </button>
          )}
        </div>
      )}
      {open && m.license_no && <LicenseCard no={m.license_no} info={license} />}
    </div>
  );
}

function LicenseCard({ no, info }: { no: string; info: LicenseInfo | undefined }) {
  const maker = info?.makers.length ? info.makers.join(" / ") : null;
  const foreign = info?.nation && info.nation !== "대한민국" ? info.nation : null;
  const rows: [string, ReactNode][] = info
    ? [
        ["허가번호", `${no}${info.origin ? ` · ${info.origin}` : ""}`],
        ["품목명", info.item_name ?? "—"],
        ["제조원", maker ? `${maker}${foreign ? ` (${foreign})` : ""}` : foreign ?? "—"],
        ...(info.client && !info.makers.includes(info.client) ? [["제조 의뢰자", info.client] as [string, ReactNode]] : []),
        ["허가일", info.permit_date ?? "—"],
        [
          "상태",
          info.revoked ? (
            <span className="text-error-600 dark:text-error-400">취소·취하{info.revoked_date ? ` (${info.revoked_date})` : ""}</span>
          ) : (
            "유효"
          ),
        ],
      ]
    : [["허가번호", no], ["상태", "식약처 품목허가 원장에서 찾지 못한 번호"]];
  return (
    <div className="surface-card hairline mt-1 rounded-control border p-2 text-ui-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="fg-subtle">{k}</dt>
            <dd className="fg-base min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <a href={EMEDI_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="link-quiet mt-1.5 inline-block">
        식약처 의료기기안심책방에서 찾기 ↗
      </a>
    </div>
  );
}

// 개원일 → "개원 1989년 · 37년차"
function openedLabel(estb: string | null | undefined): string | null {
  const y = Number(estb?.slice(0, 4));
  if (!y) return null;
  return `개원 ${y}년 · ${new Date().getFullYear() - y + 1}년차`;
}

export default function HospitalDetailPanel({ detail, loading, category, onClose, onEquipmentRegistered }: Props) {
  const [tab, setTab] = useState<EquipmentCategory | "all">(category);
  const [openLicense, setOpenLicense] = useState<number | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
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
    setOpenLicense(null);
    setOpenCats({});
  }, [category, hospitalId]);

  useEffect(() => {
    if (!showManualForm || tab === "all") return;
    fetchEquipmentCatalog(tab).then(setManualCatalog).catch(() => setManualCatalog([]));
  }, [showManualForm, tab]);

  if (loading) {
    return <div className="empty-state">불러오는 중...</div>;
  }
  if (!detail) return null;

  const { hospital, yearly_by_category } = detail;
  const yearly = tab === "all" ? [] : yearly_by_category[tab] || [];
  const licenses = detail.licenses ?? {};
  const opened = openedLabel(hospital.estb_date);

  // '전체' 보기: 분류마다 최신 연도 한 해. 영업지도 6분류를 앞에, 나머지는 대수 많은 순
  const allCats = Object.entries(yearly_by_category)
    .filter(([, yrs]) => yrs.length > 0)
    .map(([cat, yrs]) => ({
      cat,
      label: CATEGORY_LABEL[cat as EquipmentCategory] ?? detail.category_names?.[cat] ?? cat,
      latest: yrs[0],
    }))
    .sort((a, b) => {
      const ai = CATS.indexOf(a.cat as EquipmentCategory);
      const bi = CATS.indexOf(b.cat as EquipmentCategory);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return b.latest.total - a.latest.total;
    });
  const newestYear = Math.max(0, ...allCats.map((c) => c.latest.year));
  const allUnits = allCats.reduce((s, c) => s + c.latest.total, 0);

  function rowProps(m: EquipRowData) {
    return {
      m,
      license: m.license_no ? licenses[m.license_no] : undefined,
      open: openLicense === m.id,
      onToggle: () => setOpenLicense((v) => (v === m.id ? null : m.id)),
    };
  }

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
    if (!hospitalId || tab === "all" || !manualMaker || !manualModel) return;
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
          {opened && <span className="tabular-nums"> · {opened}</span>}
        </div>
        {hospital.address && <div className="fg-subtle mt-0.5 text-ui-sm">{hospital.address}</div>}
      </div>

      <div className="hairline flex gap-1 overflow-x-auto border-b px-3 pt-2">
        {[...CATS, "all" as const].map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`shrink-0 whitespace-nowrap rounded-t-[6px] px-2.5 py-1.5 text-ui font-medium transition-colors ${
              tab === c
                ? "surface-inset fg-strong"
                : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            }`}
          >
            {c === "all" ? `전체 ${allCats.length}종` : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "all" ? (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label-eyebrow">분류별 보유 장비 (최신 연도)</span>
              <span className="fg-strong text-ui font-medium tabular-nums">총 {allUnits}대</span>
            </div>
            {allCats.length === 0 ? (
              <div className="surface-sub fg-subtle rounded-control p-3 text-ui-sm">등록된 장비 자료 없음</div>
            ) : (
              <div className="space-y-1.5">
                {allCats.map(({ cat, label, latest }) => {
                  // 큰 병원은 분류가 150개가 넘어 접어 둔다(6분류 상세는 각 탭에 있다). 몇 개 안 되면 펼친다
                  const isOpen = openCats[cat] ?? allCats.length <= 6;
                  return (
                    <div key={cat} className="surface-sub rounded-control">
                      <button
                        onClick={() => setOpenCats((o) => ({ ...o, [cat]: !isOpen }))}
                        aria-expanded={isOpen}
                        className="flex w-full items-baseline gap-2 px-2.5 py-2 text-left"
                      >
                        <span className="fg-base min-w-0 flex-1 truncate text-ui font-medium">{label}</span>
                        {latest.year !== newestYear && (
                          <span className="fg-subtle text-ui-xs tabular-nums">{latest.year}년 기준</span>
                        )}
                        <span className="fg-strong text-ui font-medium tabular-nums">{latest.total}대</span>
                        <span className="fg-subtle text-ui-xs" aria-hidden>{isOpen ? "▴" : "▾"}</span>
                      </button>
                      {isOpen && (
                        <div className="px-2.5 pb-2">
                          {latest.models.map((m) => (
                            <EquipRow key={m.id} {...rowProps(m)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="fg-subtle mt-2 text-ui-xs">
              출처: 심평원 장비 등록 자료 · 식약처 품목허가. 영업지도 6분류(초음파·엑스레이 등)는 허가번호가 없는 자료라 허가 정보가 나오지 않습니다.
            </p>
          </>
        ) : (
        <>
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
                    <EquipRow
                      key={j}
                      {...rowProps(m)}
                      actions={
                        m.source === "manual" && (
                          <>
                            <button onClick={() => startEdit(m, yr.year)} className="fg-subtle hover:text-gray-700 dark:hover:text-gray-200">✏️</button>
                            <button onClick={() => removeEquipment(m.id)} className="fg-subtle hover:text-error-500">×</button>
                          </>
                        )
                      }
                    />
                  )
                )}
              </div>
            ))}
          </div>
        )}
        </>
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
