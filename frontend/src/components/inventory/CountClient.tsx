"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  COUNT_OFFICES,
  CountItem,
  CountLog,
  CountOffice,
  CountStock,
  fetchCountLogs,
  fetchCounts,
  recordCountUse,
  setCountStock,
  undoCountUse,
} from "./api";

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-10-13" → "10/13", 없으면 created_at 기준 */
function shortDate(log: CountLog): string {
  const src = log.used_on || log.created_at;
  const d = new Date(log.used_on ? `${log.used_on}T00:00:00` : log.created_at);
  if (Number.isNaN(d.getTime())) return src;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** LUMOS·쉬스처럼 "개수"로 관리하는 소모품 탭. 품목(item)만 다르고 양식은 같다. */
export default function CountClient({ item }: { item: CountItem }) {
  const { user } = useAuth();
  const [stocks, setStocks] = useState<CountStock[]>([]);
  const [logs, setLogs] = useState<CountLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 사용하기 폼. 날짜·사무실·담당직원은 연속 입력을 위해 저장 후에도 남긴다.
  const [form, setForm] = useState({
    office: COUNT_OFFICES[0] as CountOffice,
    used_on: todayLocal(),
    site: "",
    professor: "",
    procedure: "",
    staff_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [justUsed, setJustUsed] = useState<CountLog | null>(null);

  // 전체 기록 보기(필터 포함). 기본은 최근 20건만.
  const [allOpen, setAllOpen] = useState(false);
  const [filterOffice, setFilterOffice] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");

  // ADMIN 전용 초기 수량 수정
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState<Record<CountOffice, { on_hand: string; used: string }> | null>(null);
  const [adminReason, setAdminReason] = useState("");

  useEffect(() => {
    if (user && !form.staff_name) {
      setForm((f) => ({ ...f, staff_name: user.display_name || user.username }));
    }
  }, [user, form.staff_name]);

  const load = useCallback(async () => {
    try {
      const res = await fetchCounts(item);
      setStocks(res.stocks);
      setLogs(res.logs);
      setError(null);
    } catch (e) {
      setError(errorText(e, `${item} 현황을 불러오지 못했습니다`));
    } finally {
      setLoading(false);
    }
  }, [item]);

  useEffect(() => {
    load();
  }, [load]);

  const loadAll = useCallback(async () => {
    try {
      setLogs(await fetchCountLogs(item, { office: filterOffice || undefined, month: filterMonth || undefined, limit: 500 }));
    } catch (e) {
      setError(errorText(e, "기록을 불러오지 못했습니다"));
    }
  }, [item, filterOffice, filterMonth]);

  useEffect(() => {
    if (allOpen) loadAll();
  }, [allOpen, loadAll]);

  function patchStock(s: CountStock) {
    setStocks((prev) => prev.map((x) => (x.office === s.office ? s : x)));
  }

  async function submitUse() {
    if (!form.site.trim()) {
      setError("사용처를 입력해 주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await recordCountUse(item, { ...form, site: form.site.trim() });
      patchStock(res.stock);
      setLogs((prev) => [res.log, ...prev]);
      setJustUsed(res.log);
      setForm((f) => ({ ...f, site: "", professor: "", procedure: "" }));
    } catch (e) {
      setError(errorText(e, "사용 처리에 실패했습니다"));
    } finally {
      setSaving(false);
    }
  }

  async function undo(log: CountLog) {
    if (!confirm(`${log.office} · ${log.site || "사용처 없음"} 기록을 되돌릴까요? (보유 +1, 사용 -1)`)) return;
    try {
      const res = await undoCountUse(item, log.id);
      patchStock(res.stock);
      setLogs((prev) => prev.map((l) => (l.id === log.id ? res.log : l)));
      if (justUsed?.id === log.id) setJustUsed(null);
    } catch (e) {
      setError(errorText(e, "되돌리기에 실패했습니다"));
    }
  }

  function openAdmin() {
    const d = {} as Record<CountOffice, { on_hand: string; used: string }>;
    for (const o of COUNT_OFFICES) {
      const s = stocks.find((x) => x.office === o);
      d[o] = { on_hand: String(s?.on_hand ?? 0), used: String(s?.used ?? 0) };
    }
    setAdminDraft(d);
    setAdminReason("");
    setAdminOpen(true);
  }

  async function saveAdmin() {
    if (!adminDraft) return;
    const items: CountStock[] = COUNT_OFFICES.map((o) => ({
      office: o,
      on_hand: Number(adminDraft[o].on_hand),
      used: Number(adminDraft[o].used),
    }));
    if (items.some((i) => !Number.isInteger(i.on_hand) || !Number.isInteger(i.used) || i.on_hand < 0 || i.used < 0)) {
      setError("수량은 0 이상의 정수여야 합니다");
      return;
    }
    try {
      const res = await setCountStock(item, items, adminReason);
      setStocks(res.stocks);
      setAdminOpen(false);
      await load();
    } catch (e) {
      setError(errorText(e, "저장에 실패했습니다"));
    }
  }

  const canUndo = (l: CountLog) => l.kind === "use" && !!user && (user.is_admin || l.actor_user_id === user.id);
  const selected = stocks.find((s) => s.office === form.office);
  const total = stocks.reduce((a, s) => ({ on_hand: a.on_hand + s.on_hand, used: a.used + s.used }), { on_hand: 0, used: 0 });

  const field = "field w-full";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 px-3 py-2 text-ui-sm text-error-700 dark:border-error-500/40 dark:bg-error-500/10 dark:text-error-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            닫기
          </button>
        </div>
      )}

      {/* 사무실별 현황 */}
      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="card-title">{item} 사무실별 현황</h2>
          <span className="fg-muted text-ui-xs">
            전체 보유 {total.on_hand} · 사용 {total.used}
          </span>
          {user?.is_admin && (
            <button onClick={openAdmin} className="btn btn-default ml-auto !px-2.5">
              초기 수량 수정
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {COUNT_OFFICES.map((o) => {
            const s = stocks.find((x) => x.office === o) ?? { office: o, on_hand: 0, used: 0 };
            const denom = s.on_hand + s.used;
            const pct = denom ? Math.round((s.used / denom) * 100) : 0;
            return (
              <div key={o} className="surface-card px-3 py-3 sm:px-4">
                <div className="fg-base text-ui-sm font-semibold">{o}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="fg-strong text-ui-2xl font-bold tabular-nums">{loading ? "–" : s.on_hand}</span>
                  <span className="fg-muted text-ui-xs">보유</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-ui-lg font-semibold tabular-nums text-brand-500">{loading ? "–" : s.used}</span>
                  <span className="fg-muted text-ui-xs">사용</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 사용 기록 남기기 */}
      <section className="surface-card space-y-3 px-4 py-4">
        <h2 className="card-title">사용 기록 남기기</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="fg-muted mb-1 block text-ui-xs font-medium">날짜</span>
            <input type="date" value={form.used_on} onChange={(e) => setForm({ ...form, used_on: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="fg-muted mb-1 block text-ui-xs font-medium">담당직원</span>
            <input value={form.staff_name} onChange={(e) => setForm({ ...form, staff_name: e.target.value })} className={field} />
          </label>
        </div>
        <div>
          <span className="fg-muted mb-1 block text-ui-xs font-medium">사무실</span>
          <div className="seg w-full">
            {COUNT_OFFICES.map((o) => (
              <button
                key={o}
                onClick={() => setForm({ ...form, office: o })}
                className={`seg-item flex-1 justify-center ${form.office === o ? "seg-item-on" : ""}`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="fg-muted mb-1 block text-ui-xs font-medium">사용처</span>
          <input
            value={form.site}
            onChange={(e) => setForm({ ...form, site: e.target.value })}
            placeholder="병원명"
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="fg-muted mb-1 block text-ui-xs font-medium">담당교수</span>
            <input value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="fg-muted mb-1 block text-ui-xs font-medium">시술내용</span>
            <input value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} className={field} />
          </label>
        </div>
        <button
          onClick={submitUse}
          disabled={saving || loading || !selected || selected.on_hand <= 0}
          className="btn btn-primary h-12 w-full flex-col gap-0 sm:h-10 sm:w-auto sm:flex-row sm:gap-2 sm:px-5"
        >
          <span className="text-ui-md font-semibold">사용하기</span>
          {selected && (
            <span className="text-ui-xs font-normal opacity-80">
              {selected.on_hand <= 0
                ? `${selected.office} 보유 0개 — 관리자에게 수량 등록을 요청하세요`
                : `${selected.office} 보유 ${selected.on_hand} → ${selected.on_hand - 1} · 사용 ${selected.used} → ${selected.used + 1}`}
            </span>
          )}
        </button>
        {justUsed && justUsed.kind === "use" && (
          <div className="flex flex-wrap items-center gap-2 rounded-card bg-success-50 px-3 py-2 text-ui-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">
            기록됨 — {justUsed.office} · {justUsed.site} · 잔여 보유 {justUsed.on_hand_after}
            <button onClick={() => undo(justUsed)} className="ml-auto underline">
              잘못 눌렀어요 (되돌리기)
            </button>
          </div>
        )}
      </section>

      {/* 기록 */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="card-title">{allOpen ? "전체 기록" : "최근 사용"}</h2>
          <button
            onClick={() => {
              if (allOpen) {
                setAllOpen(false);
                load();
              } else setAllOpen(true);
            }}
            className="btn btn-ghost ml-auto !px-2.5"
          >
            {allOpen ? "최근 20건만" : "전체 기록 보기"}
          </button>
        </div>
        {allOpen && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg">
              {["", ...COUNT_OFFICES].map((o) => (
                <button key={o || "all"} onClick={() => setFilterOffice(o)} className={`seg-item ${filterOffice === o ? "seg-item-on" : ""}`}>
                  {o || "전체"}
                </button>
              ))}
            </div>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="field" />
            {filterMonth && (
              <button onClick={() => setFilterMonth("")} className="btn btn-ghost !px-2">
                월 해제
              </button>
            )}
          </div>
        )}
        <div className="surface-card divide-y divide-gray-100 dark:divide-gray-800">
          {logs.length === 0 && <div className="empty-state">{loading ? "불러오는 중..." : "기록이 없습니다"}</div>}
          {logs.map((l) => (
            <div key={l.id} className={`px-4 py-3 ${l.kind === "undone" ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="fg-muted w-10 shrink-0 text-ui-xs tabular-nums">{shortDate(l)}</span>
                <span className="chip-quiet">{l.office}</span>
                {l.kind === "adjust" ? (
                  <span className="fg-base min-w-0 flex-1 text-ui-sm">
                    <span className="rounded-control bg-warning-50 px-1.5 py-0.5 text-ui-xs font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">관리자</span>{" "}
                    초기 수량 변경 · {l.detail}
                    {l.note ? ` · ${l.note}` : ""}
                  </span>
                ) : (
                  <span className={`fg-strong min-w-0 flex-1 truncate text-ui-md font-medium ${l.kind === "undone" ? "line-through" : ""}`}>
                    {l.site || "—"}
                  </span>
                )}
                <span className="fg-muted shrink-0 text-ui-xs">{l.staff_name || l.actor_name}</span>
              </div>
              {l.kind !== "adjust" && (
                <div className="fg-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-12 text-ui-xs">
                  {l.professor && <span>{l.professor}</span>}
                  {l.procedure && <span>{l.procedure}</span>}
                  <span>
                    잔여 보유 {l.on_hand_after} · 사용 {l.used_after}
                  </span>
                  {l.kind === "undone" && <span className="text-warning-600 dark:text-warning-400">{l.note || "되돌림"}</span>}
                  {canUndo(l) && (
                    <button onClick={() => undo(l)} className="text-error-500 underline">
                      되돌리기
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ADMIN 전용 초기 수량 수정 */}
      {adminOpen && adminDraft && (
        <>
          <div className="fixed inset-0 z-40 bg-gray-900/30" onClick={() => setAdminOpen(false)} />
          <div className="surface-card fixed inset-x-0 bottom-0 z-50 rounded-b-none border-x-0 border-b-0 p-4 shadow-pop sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:border">
            <div className="mb-3">
              <div className="fg-strong text-ui-lg font-semibold">{item} 초기 수량 수정</div>
              <div className="text-ui-xs font-medium text-warning-700 dark:text-warning-400">ADMIN 계정만 열 수 있습니다</div>
            </div>
            <div className="grid grid-cols-[56px_1fr_1fr] items-center gap-2">
              <span />
              <span className="fg-muted text-ui-xs font-medium">보유</span>
              <span className="fg-muted text-ui-xs font-medium">사용</span>
              {COUNT_OFFICES.map((o) => (
                <div key={o} className="contents">
                  <span className="fg-strong text-ui-md font-semibold">{o}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`${o} 보유`}
                    value={adminDraft[o].on_hand}
                    onChange={(e) => setAdminDraft({ ...adminDraft, [o]: { ...adminDraft[o], on_hand: e.target.value } })}
                    className="field h-11 w-full text-center text-ui-lg font-semibold"
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`${o} 사용`}
                    value={adminDraft[o].used}
                    onChange={(e) => setAdminDraft({ ...adminDraft, [o]: { ...adminDraft[o], used: e.target.value } })}
                    className="field h-11 w-full text-center text-ui-lg font-semibold"
                  />
                </div>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="fg-muted mb-1 block text-ui-xs font-medium">변경 사유 (기록에 남음)</span>
              <input value={adminReason} onChange={(e) => setAdminReason(e.target.value)} placeholder="예: 10/13 본사 입고 5개" className={field} />
            </label>
            <p className="fg-muted mt-2 text-ui-xs">
              이 값은 &apos;사용하기&apos;가 깎아 나가는 출발점입니다. 바꾸면 사무실마다 관리자 변경 기록 1줄이 남고, 기존 사용 기록은 그대로 보존됩니다.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => setAdminOpen(false)} className="btn btn-default">
                취소
              </button>
              <button onClick={saveAdmin} className="btn btn-primary ml-auto !px-5">
                저장
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
