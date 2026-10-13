"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import HistoryPanel from "./HistoryPanel";
import {
  CellConflict,
  CellEdit,
  CellValue,
  InvEquipmentRow,
  SyncResult,
  createEquipment,
  deleteEquipment,
  reorderEquipment,
  saveCells,
  syncEquipment,
} from "./api";

export const SUBTYPES: Record<"지멘스" | "타사", string[]> = {
  지멘스: ["장비", "프로브", "ECG CABLE"],
  타사: ["신품", "중고", "데모"],
};

const POLL_MS = 3000;

type ColKey =
  | "name" | "serial_no" | "notes" | "location"
  | "manufacture_date" | "manufacturer" | "purchase_price" | "purchase_from" | "is_opened";

interface Col {
  key: ColKey;
  label: string;
  type: "text" | "bool";
  width: string;
  mono?: boolean;
}

// 지멘스(초음파)는 사용자가 정한 7칸: 제조사/이름/S/N/비고/위치/제조년월/개봉여부 (등급은 2026-10 삭제).
// 타사(장비)는 기존 그대로.
const COLUMNS: Record<"지멘스" | "타사", Col[]> = {
  지멘스: [
    { key: "manufacturer", label: "제조사", type: "text", width: "w-[110px]" },
    { key: "name", label: "이름", type: "text", width: "w-[160px]" },
    { key: "notes", label: "비고", type: "text", width: "w-[220px]" },
    { key: "location", label: "위치", type: "text", width: "w-[170px]" },
    { key: "serial_no", label: "S/N", type: "text", width: "w-[140px]", mono: true },
    { key: "manufacture_date", label: "제조년월", type: "text", width: "w-[130px]" },
    { key: "is_opened", label: "개봉여부", type: "bool", width: "w-[90px]" },
  ],
  타사: [
    { key: "name", label: "이름", type: "text", width: "w-[160px]" },
    { key: "manufacturer", label: "제조사", type: "text", width: "w-[130px]" },
    { key: "serial_no", label: "S/N", type: "text", width: "w-[140px]", mono: true },
    { key: "notes", label: "비고", type: "text", width: "w-[200px]" },
    { key: "location", label: "위치", type: "text", width: "w-[140px]" },
    { key: "manufacture_date", label: "제조년월", type: "text", width: "w-[120px]" },
    { key: "purchase_price", label: "매입가", type: "text", width: "w-[110px]" },
    { key: "purchase_from", label: "매입처", type: "text", width: "w-[130px]" },
  ],
};

/** 폰 폭인지. 서버에서는 화면 폭을 알 수 없으므로 서버 스냅샷은 false다. */
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 640px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 640px)").matches,
    () => false,
  );
}

function cellText(row: InvEquipmentRow, col: Col): string {
  if (col.type === "bool") return row.is_opened ? "개봉" : "미개봉";
  const v = row[col.key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function parseBool(s: string): boolean {
  return ["개봉", "true", "1", "y", "yes", "o"].includes(s.trim().toLowerCase());
}

function withField(row: InvEquipmentRow, field: string, value: CellValue): InvEquipmentRow {
  return { ...row, [field]: value } as InvEquipmentRow;
}

function blankPayload(category: string, itemType: string) {
  return {
    category, item_type: itemType, name: "", serial_no: null, location: null,
    notes: null, manufacture_date: null, manufacturer: null, purchase_price: null,
    purchase_from: null, is_opened: false,
  };
}

function byId(rows: InvEquipmentRow[]): Map<number, InvEquipmentRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

function sortedRows(map: Map<number, InvEquipmentRow>): InvEquipmentRow[] {
  // 서버의 표시 순서(sort_order)를 따른다. 없으면 id(옛 행) — 둘이 같은 값이면 id로 안정 정렬.
  return [...map.values()].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id) || a.id - b.id);
}

// 제조사는 몇 가지 값이 반복되므로 값마다 고정된 색을 준다(같은 제조사 = 같은 색).
// 문자열 해시 → 12색 팔레트. 데이터가 바뀌어도 같은 글자는 늘 같은 색이다.
const TONES = [
  "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-lime-50 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300",
  "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
];

function toneOf(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

const ORANGE = "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300";

/** 제조사 색. SIEMENS(지멘스)는 주황으로 고정, 나머지(SONOSCAPE·DRGEM 등)는 해시 색. */
function manufacturerTone(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "siemens" || v === "지멘스" || v.startsWith("siemens ")) return ORANGE;
  return toneOf(v);
}

// 이름·비고·위치는 가장 많이 보는 칸이라 굵게
const BOLD_COLS = new Set<ColKey>(["name", "notes", "location"]);

/** 폰 카드 한 장에 보여 줄 값. 이름·제조사·개봉은 머리에, 나머지는 라벨 붙은 2열 격자에. */
type SheetDraft = Record<ColKey, string | boolean>;

function draftOf(row: InvEquipmentRow, cols: Col[]): SheetDraft {
  const d = {} as SheetDraft;
  for (const c of cols) d[c.key] = c.type === "bool" ? row.is_opened : cellText(row, c);
  return d;
}

export default function InventoryClient({
  category,
  itemType: controlledItemType,
}: {
  category: "지멘스" | "타사";
  /** 바깥에서 구분 탭을 그릴 때(초음파 페이지의 장비/프로브/ECG CABLE/LUMOS) 넘긴다. 주면 안쪽 탭은 숨긴다. */
  itemType?: string;
}) {
  const { user } = useAuth();
  const cols = COLUMNS[category];

  const [rows, setRows] = useState<InvEquipmentRow[]>([]);
  const [ownItemType, setItemType] = useState(SUBTYPES[category][0]);
  const itemType = controlledItemType ?? ownItemType;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({});
  const [sort, setSort] = useState<{ key: ColKey; dir: "asc" | "desc" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [online, setOnline] = useState(true);
  const [conflicts, setConflicts] = useState<CellConflict[]>([]);
  const [sel, setSel] = useState<{ r: number; c: number; r2: number; c2: number } | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRow, setHistoryRow] = useState<{ id: number; label: string } | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [focusRowId, setFocusRowId] = useState<number | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);
  const isNarrow = useIsNarrow();
  // 폰에서는 표를 그리지 않는다. 칸 하나가 50px 남짓이라 비고·위치처럼 긴 값이 잘려서
  // 읽을 수 없었기 때문. 대신 행 하나를 카드 하나로 펼쳐 모든 칸을 보여 주고,
  // 카드를 누르면 하단 시트에서 행 전체를 큰 입력칸으로 고친다.
  // 저장 전까지 rows는 건드리지 않고 draft만 들고 있어 폴링이 입력 중인 글자를 덮지 않는다.
  const [sheet, setSheet] = useState<{ rowId: number; draft: SheetDraft; isNew: boolean } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef<string | null>(null);
  const rowsRef = useRef<InvEquipmentRow[]>([]);
  const viewRef = useRef<InvEquipmentRow[]>([]);
  const selRef = useRef<typeof sel>(null);
  // 지금 커서가 들어가 있는 칸 — 폴링으로 들어온 서버 값이 타이핑 중인 글자를 덮지 않게 한다.
  const focusRef = useRef<{ rowId: number; field: ColKey } | null>(null);
  const originalRef = useRef<string>("");
  const undoRef = useRef<CellEdit[][]>([]);
  const userIdRef = useRef<number | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // ----------------------------------------------------------- 보기(필터/정렬)

  const view = useMemo(() => {
    let out = rows.filter((r) => r.item_type === itemType);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((r) => cols.some((c) => cellText(r, c).toLowerCase().includes(q)));
    for (const c of cols) {
      const f = (filters[c.key] || "").trim().toLowerCase();
      if (f) out = out.filter((r) => cellText(r, c).toLowerCase().includes(f));
    }
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = cellText(a, col);
          const bv = cellText(b, col);
          if (av === bv) return 0;
          if (av === "") return 1; // 빈 칸은 방향과 무관하게 항상 아래
          if (bv === "") return -1;
          const an = Number(av.replace(/[,\s]/g, ""));
          const bn = Number(bv.replace(/[,\s]/g, ""));
          const cmp = !Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : av.localeCompare(bv, "ko");
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, itemType, query, filters, sort, cols]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);

  const range = useMemo(() => {
    if (!sel) return null;
    return {
      r1: Math.min(sel.r, sel.r2), r2: Math.max(sel.r, sel.r2),
      c1: Math.min(sel.c, sel.c2), c2: Math.max(sel.c, sel.c2),
    };
  }, [sel]);
  const rangeSize = range ? (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) : 0;

  // ----------------------------------------------------------- 실시간 동기화(폴링)

  const flashCells = useCallback((keys: Record<string, string>) => {
    if (!Object.keys(keys).length) return;
    setFlash((prev) => ({ ...prev, ...keys }));
    setTimeout(() => {
      setFlash((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(keys)) delete next[k];
        return next;
      });
    }, 3000);
  }, []);

  const applyDelta = useCallback(
    (res: SyncResult) => {
      // 바뀐 게 없으면 상태를 건드리지 않는다 — 3초마다 불필요하게 다시 그리지 않도록.
      if (!res.rows.length && !res.deleted.length) return;
      const map = byId(rowsRef.current);
      const nextFlash: Record<string, string> = {};
      for (const nr of res.rows) {
        const old = map.get(nr.id);
        let merged = nr;
        const f = focusRef.current;
        if (f && old && f.rowId === nr.id) merged = withField(nr, f.field, old[f.field] as CellValue);
        if (old && nr.updated_by && nr.updated_by !== userIdRef.current) {
          for (const c of cols) {
            if (cellText(old, c) !== cellText(merged, c)) nextFlash[`${nr.id}:${c.key}`] = nr.updated_by_name || "다른 사용자";
          }
        }
        map.set(nr.id, merged);
      }
      for (const id of res.deleted) map.delete(id);
      setRows(sortedRows(map));
      flashCells(nextFlash);
    },
    [cols, flashCells]
  );

  useEffect(() => {
    let cancelled = false;
    sinceRef.current = null;
    setRows([]);
    setSel(null);
    setLoading(true);

    const pull = async () => {
      try {
        const res = await syncEquipment(category, sinceRef.current);
        if (cancelled) return;
        sinceRef.current = res.server_time;
        if (res.full) setRows(res.rows);
        else applyDelta(res);
        setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    pull();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [category, applyDelta]);

  // ----------------------------------------------------------- 저장

  const runEdits = useCallback(async (edits: CellEdit[], undoable = true) => {
    if (!edits.length) return;
    // 낙관적 반영 — 서버 응답을 기다리지 않고 화면부터 바꾼다
    setRows((prev) => {
      const map = byId(prev);
      for (const e of edits) {
        const cur = map.get(e.row_id);
        if (cur) map.set(e.row_id, withField(cur, e.field, e.new_value));
      }
      return sortedRows(map);
    });
    setStatus("saving");
    try {
      const res = await saveCells(edits);
      setRows((prev) => {
        const map = byId(prev);
        for (const u of res.updated) {
          const cur = map.get(u.id);
          const f = focusRef.current;
          map.set(u.id, f && cur && f.rowId === u.id ? withField(u, f.field, cur[f.field] as CellValue) : u);
        }
        // 충돌한 칸은 서버(상대방) 값으로 되돌려 둔다 — 조용한 덮어쓰기 방지
        for (const c of res.conflicts) {
          const cur = map.get(c.row_id);
          if (cur) map.set(c.row_id, withField(cur, c.field, c.theirs_raw));
        }
        return sortedRows(map);
      });
      if (res.conflicts.length) setConflicts((prev) => [...prev, ...res.conflicts]);
      if (undoable) {
        const applied = edits.filter((e) => !res.conflicts.some((c) => c.row_id === e.row_id && c.field === e.field));
        if (applied.length) {
          undoRef.current = [...undoRef.current, applied].slice(-50);
          setUndoDepth(undoRef.current.length);
        }
      }
      setStatus(res.conflicts.length ? "error" : "saved");
      setHistoryKey((k) => k + 1);
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(t);
  }, [status]);

  const undo = useCallback(() => {
    const batch = undoRef.current.pop();
    setUndoDepth(undoRef.current.length);
    if (!batch) return;
    runEdits(
      batch.map((e) => ({ row_id: e.row_id, field: e.field, old_value: e.new_value, new_value: e.old_value })),
      false
    );
  }, [runEdits]);

  // ----------------------------------------------------------- 셀 편집

  const setLocal = useCallback((rowId: number, field: ColKey, value: CellValue) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? withField(r, field, value) : r)));
  }, []);

  const commit = useCallback(
    (rowId: number, col: Col) => {
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row) return;
      const current = cellText(row, col);
      const before = originalRef.current;
      if (current === before) return;
      originalRef.current = current;
      runEdits([{ row_id: rowId, field: col.key, old_value: before, new_value: current }]);
    },
    [runEdits]
  );

  // ---------------------------------------------- 폰 전용 행 편집 시트

  const openSheet = useCallback(
    (row: InvEquipmentRow, isNew = false) => setSheet({ rowId: row.id, draft: draftOf(row, cols), isNew }),
    [cols]
  );

  /** 시트의 값을 저장한다. 바뀐 칸만 골라 인라인 편집과 같은 runEdits 경로로 보내므로
   *  충돌 감지·실행취소·변경 이력이 그대로 동작한다. */
  const saveSheet = useCallback(() => {
    if (!sheet) return;
    const row = rowsRef.current.find((r) => r.id === sheet.rowId);
    if (row) {
      const edits: CellEdit[] = [];
      for (const c of cols) {
        const before: CellValue = c.type === "bool" ? row.is_opened : cellText(row, c);
        const after = sheet.draft[c.key];
        if (before !== after) edits.push({ row_id: row.id, field: c.key, old_value: before, new_value: after });
      }
      runEdits(edits);
    }
    setSheet(null);
  }, [sheet, cols, runEdits]);

  /** 취소. 방금 '추가'로 만든 빈 행을 아무것도 안 적고 닫으면 빈 행이 남지 않게 지운다. */
  const cancelSheet = useCallback(async () => {
    if (!sheet) return;
    setSheet(null);
    if (!sheet.isNew) return;
    const row = rowsRef.current.find((r) => r.id === sheet.rowId);
    const empty = row && cols.every((c) => (c.type === "bool" ? !row.is_opened : cellText(row, c) === ""));
    if (empty) {
      await deleteEquipment(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setHistoryKey((k) => k + 1);
    }
  }, [sheet, cols]);

  const focusCell = useCallback(
    (r: number, c: number) => {
      const nr = Math.max(0, Math.min(viewRef.current.length - 1, r));
      const nc = Math.max(0, Math.min(cols.length - 1, c));
      setSel({ r: nr, c: nc, r2: nr, c2: nc });
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`);
      if (!el) return;
      el.focus();
      // 키보드 이동으로 들어온 칸은 구글 시트처럼 전체 선택(이어 타이핑하면 교체).
      // 주의: 이 호출은 이벤트 핸들러 안에서만 한다. 렌더마다 재생성되는 ref 콜백에서 select()를
      // 부르면 한글 조합이 끊겨 두 글자 이상 입력되지 않는다.
      if (el instanceof HTMLInputElement) el.select();
    },
    [cols.length]
  );

  useEffect(() => {
    if (focusRowId == null) return;
    const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-rowid="${focusRowId}"] input`);
    el?.focus();
    setFocusRowId(null);
  }, [focusRowId, view]);

  const clearRange = useCallback(() => {
    if (!range) return;
    const edits: CellEdit[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = viewRef.current[r];
      if (!row) continue;
      for (let c = range.c1; c <= range.c2; c++) {
        const col = cols[c];
        const before = cellText(row, col);
        if (col.type === "bool") {
          if (row.is_opened) edits.push({ row_id: row.id, field: col.key, old_value: true, new_value: false });
        } else if (before !== "") {
          edits.push({ row_id: row.id, field: col.key, old_value: before, new_value: "" });
        }
      }
    }
    runEdits(edits);
  }, [range, cols, runEdits]);

  const rangeToTsv = useCallback(() => {
    if (!range) return "";
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = viewRef.current[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) cells.push(cellText(row, cols[c]));
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }, [range, cols]);

  const pasteMatrix = useCallback(
    async (startR: number, startC: number, matrix: string[][]) => {
      // 붙여넣을 줄 수가 현재 행 수보다 많으면 모자란 만큼 행을 먼저 만든다.
      const targetIds: number[] = [];
      const created: InvEquipmentRow[] = [];
      for (let i = 0; i < matrix.length; i++) {
        const existing = viewRef.current[startR + i];
        if (existing) {
          targetIds.push(existing.id);
        } else {
          const row = await createEquipment(blankPayload(category, itemType));
          created.push(row);
          targetIds.push(row.id);
        }
      }
      if (created.length) setRows((prev) => sortedRows(byId([...prev, ...created])));

      const lookup = byId([...rowsRef.current, ...created]);
      const edits: CellEdit[] = [];
      for (let i = 0; i < matrix.length; i++) {
        const row = lookup.get(targetIds[i]);
        if (!row) continue;
        for (let j = 0; j < matrix[i].length; j++) {
          const col = cols[startC + j];
          if (!col) continue;
          const raw = matrix[i][j];
          const before = cellText(row, col);
          if (col.type === "bool") {
            const next = parseBool(raw);
            if (next !== row.is_opened) edits.push({ row_id: row.id, field: col.key, old_value: row.is_opened, new_value: next });
          } else if (raw !== before) {
            edits.push({ row_id: row.id, field: col.key, old_value: before, new_value: raw });
          }
        }
      }
      await runEdits(edits);
      setHistoryKey((k) => k + 1);
    },
    [category, itemType, cols, runEdits]
  );

  const onCopy = (e: React.ClipboardEvent) => {
    if (!range || rangeSize <= 1) return; // 한 칸만 선택했으면 브라우저 기본 복사(부분 텍스트)
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeToTsv());
  };

  const onCut = (e: React.ClipboardEvent) => {
    if (!range || rangeSize <= 1) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeToTsv());
    clearRange();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\r\n]/.test(text)) return; // 값 하나면 기본 붙여넣기
    e.preventDefault();
    const s = selRef.current;
    if (!s) return;
    const matrix = text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
    pasteMatrix(s.r, s.c, matrix);
  };

  const onCellKeyDown = (e: React.KeyboardEvent, r: number, c: number, row: InvEquipmentRow, col: Col) => {
    // 한글 조합 중(IME)에는 이동/단축키를 가로채지 않는다 — 조합이 끊기면 글자가 사라진다.
    if (e.nativeEvent.isComposing) return;
    const input = e.currentTarget instanceof HTMLInputElement ? e.currentTarget : null;
    const meta = e.ctrlKey || e.metaKey;

    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (col.type !== "bool") setLocal(row.id, col.key, originalRef.current);
      return;
    }
    if (e.shiftKey && e.key.startsWith("Arrow")) {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      setSel((s) =>
        s
          ? {
              ...s,
              r2: Math.max(0, Math.min(viewRef.current.length - 1, s.r2 + d[0])),
              c2: Math.max(0, Math.min(cols.length - 1, s.c2 + d[1])),
            }
          : s
      );
      return;
    }

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        commit(row.id, col);
        focusCell(r + (e.shiftKey ? -1 : 1), c);
        return;
      case "Tab": {
        e.preventDefault();
        commit(row.id, col);
        const nc = c + (e.shiftKey ? -1 : 1);
        if (nc >= cols.length) focusCell(r + 1, 0);
        else if (nc < 0) focusCell(r - 1, cols.length - 1);
        else focusCell(r, nc);
        return;
      }
      case "ArrowDown":
        e.preventDefault();
        commit(row.id, col);
        focusCell(r + 1, c);
        return;
      case "ArrowUp":
        e.preventDefault();
        commit(row.id, col);
        focusCell(r - 1, c);
        return;
      case "ArrowLeft":
        // 텍스트 칸은 캐럿이 맨 앞에 있을 때만 왼쪽 칸으로 이동(그 전에는 커서 이동)
        if (input && !(input.selectionStart === 0 && input.selectionEnd === 0)) return;
        e.preventDefault();
        commit(row.id, col);
        focusCell(r, c - 1);
        return;
      case "ArrowRight":
        if (input && !(input.selectionStart === input.value.length && input.selectionEnd === input.value.length)) return;
        e.preventDefault();
        commit(row.id, col);
        focusCell(r, c + 1);
        return;
      case "Delete":
        if (rangeSize > 1) {
          e.preventDefault();
          clearRange();
        }
        return;
      case " ":
        if (col.type === "bool") {
          e.preventDefault();
          runEdits([{ row_id: row.id, field: "is_opened", old_value: row.is_opened, new_value: !row.is_opened }]);
        }
        return;
      default:
    }
  };

  // ----------------------------------------------------------- 행 추가/삭제

  async function addRow() {
    try {
      const created = await createEquipment(blankPayload(category, itemType));
      setRows((prev) => sortedRows(byId([...prev, created])));
      if (isNarrow) openSheet(created, true);
      else setFocusRowId(created.id);
      setHistoryKey((k) => k + 1);
    } catch {
      setStatus("error");
    }
  }

  async function removeRows(ids: number[]) {
    if (!ids.length) return;
    if (!confirm(ids.length === 1 ? "이 행을 삭제하시겠습니까?" : `선택한 ${ids.length}개 행을 삭제하시겠습니까?`)) return;
    for (const id of ids) await deleteEquipment(id);
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSel(null);
    setSheet((s) => (s && ids.includes(s.rowId) ? null : s));
    setHistoryKey((k) => k + 1);
  }

  // ----------------------------------------------------------- 드래그 정렬
  // 손잡이(⋮⋮)를 누른 채 위아래로 끌면 놓을 자리에 선이 그어지고, 놓으면 그 자리로 간다.
  // 포인터 이벤트라 마우스·터치 모두 같은 코드다(손잡이에 touch-action: none).
  const dragRef = useRef<{ id: number; from: number } | null>(null);
  const [drag, setDrag] = useState<{ id: number; over: number } | null>(null);

  const dropIndexAt = useCallback((clientY: number): number => {
    const root = isNarrow ? cardsRef.current : gridRef.current;
    const els = root ? Array.from(root.querySelectorAll<HTMLElement>("[data-rowid]")) : [];
    for (let i = 0; i < els.length; i++) {
      const b = els[i].getBoundingClientRect();
      if (clientY < b.top + b.height / 2) return i;
    }
    return els.length;
  }, [isNarrow]);

  const onHandlePointerDown = (e: React.PointerEvent, rowId: number, index: number) => {
    if (sort) return; // 열 정렬 중엔 보이는 순서와 저장 순서가 달라 끌기 금지
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: rowId, from: index };
    setDrag({ id: rowId, over: index });
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // 가장자리 근처면 자동 스크롤
    const edge = 48;
    if (isNarrow) {
      if (e.clientY < edge) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    } else if (gridRef.current) {
      const b = gridRef.current.getBoundingClientRect();
      if (e.clientY < b.top + edge) gridRef.current.scrollTop -= 12;
      else if (e.clientY > b.bottom - edge) gridRef.current.scrollTop += 12;
    }
    const over = dropIndexAt(e.clientY);
    setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
  };

  const onHandlePointerUp = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const over = dropIndexAt(e.clientY);
    if (over === d.from || over === d.from + 1) return; // 제자리
    const visible = viewRef.current;
    const target = visible[over] ?? null; // null이면 맨 아래
    // 필터로 일부만 보일 수 있으므로, 같은 구분의 전체 목록에서 자리를 옮긴다
    const full = rowsRef.current.filter((r) => r.item_type === itemType && r.id !== d.id);
    const moved = rowsRef.current.find((r) => r.id === d.id);
    if (!moved) return;
    const at = target ? full.findIndex((r) => r.id === target.id) : full.length;
    full.splice(at < 0 ? full.length : at, 0, moved);
    const ids = full.map((r) => r.id);
    // 낙관적 반영 — 서버 응답 전에 화면 순서부터 바꾼다
    setRows((prev) => {
      const map = byId(prev);
      ids.forEach((id, k) => {
        const cur = map.get(id);
        if (cur) map.set(id, { ...cur, sort_order: k + 1 });
      });
      return sortedRows(map);
    });
    try {
      const res = await reorderEquipment(ids, d.id);
      setRows((prev) => {
        const map = byId(prev);
        for (const u of res.updated) map.set(u.id, u);
        return sortedRows(map);
      });
      setHistoryKey((k) => k + 1);
    } catch {
      setStatus("error");
    }
  };

  const dropLineClass = (index: number) =>
    drag && drag.over === index ? "border-t-2 !border-t-brand-500" : "";

  const selectedRowIds = useMemo(() => {
    if (!range) return [];
    const ids: number[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = view[r];
      if (row) ids.push(row.id);
    }
    return ids;
  }, [range, view]);

  function toggleSort(key: ColKey) {
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  function overwriteConflict(c: CellConflict) {
    const col = cols.find((x) => x.key === c.field);
    const value: CellValue = col?.type === "bool" ? c.mine === "개봉" : c.mine;
    runEdits([{ row_id: c.row_id, field: c.field, old_value: c.theirs_raw, new_value: value, force: true }]);
    dismissConflict(c);
  }

  function dismissConflict(c: CellConflict) {
    setConflicts((prev) => prev.filter((x) => !(x.row_id === c.row_id && x.field === c.field)));
  }

  // 두 재고 페이지(초음파=지멘스 / 장비=타사)가 색이 같아 구분이 안 된다는 요청 → 카테고리별 강조색.
  const ac =
    category === "지멘스"
      ? { bar: "border-t-4 border-brand-500", sel: "ring-brand-500", selBg: "bg-brand-50/70 dark:bg-brand-500/10" }
      : { bar: "border-t-4 border-teal-500", sel: "ring-teal-500", selBg: "bg-teal-50/70 dark:bg-teal-500/10" };

  const statusLabel =
    !online ? "연결 끊김 — 재시도 중" : status === "saving" ? "저장 중..." : status === "saved" ? "저장됨" : status === "error" ? "저장 실패/충돌" : "실시간 동기화 중";
  const statusColor =
    !online || status === "error" ? "bg-error-500" : status === "saving" ? "bg-warning-500" : "bg-success-500";

  const inRange = (r: number, c: number) =>
    !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-1.5 px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
        {controlledItemType === undefined && (
          <div className="seg">
            {SUBTYPES[category].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setItemType(t);
                  setSel(null);
                }}
                className={`seg-item ${itemType === t ? "seg-item-on" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="전체 검색..."
          className="field w-full sm:w-48"
        />

        <span className="chip-quiet">
          <span className={`dot ${statusColor} ${status === "saving" ? "animate-pulse" : ""}`} />
          {statusLabel}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={undo}
            disabled={undoDepth === 0}
            title="Ctrl+Z"
            className="btn btn-default !px-2.5 sm:!px-3.5"
          >
            실행취소
          </button>
          <button
            onClick={() => {
              setHistoryRow(null);
              setHistoryOpen((v) => !v);
            }}
            className={`btn !px-2.5 sm:!px-3.5 ${historyOpen ? "btn-primary" : "btn-default"}`}
          >
            변경 내역
          </button>
          {selectedRowIds.length > 0 && (
            <button
              onClick={() => removeRows(selectedRowIds)}
              className="btn btn-danger"
            >
              {selectedRowIds.length}개 행 삭제
            </button>
          )}
          <button onClick={addRow} className="btn btn-primary !px-2.5 sm:!px-3.5">
            + 행 추가
          </button>
        </div>

        <p className="fg-subtle hidden w-full text-ui-xs sm:block">
          Tab/Enter/화살표로 칸 이동 · Shift+화살표로 범위 선택 · Ctrl+C/X/V 복사·잘라내기·붙여넣기(엑셀·구글시트와 호환) ·
          Delete로 범위 비우기 · Ctrl+Z 실행취소 · 왼쪽 ⋮⋮를 끌어 순서 이동 · 수정 즉시 자동 저장되고 {POLL_MS / 1000}초마다 다른 사람 변경이 반영됩니다
        </p>
        <p className="fg-subtle w-full text-ui-xs sm:hidden">
          카드 하나가 재고 하나 · 누르면 전체 칸 수정 · 오른쪽 ⋮⋮를 끌어 순서 이동
        </p>
      </div>

      <div className={`flex gap-4 ${historyOpen ? "flex-col xl:flex-row" : ""}`}>
        <div className="min-w-0 flex-1 space-y-3">
          {conflicts.length > 0 && (
            <div className="rounded-card border border-warning-300 bg-warning-50 p-3 text-ui-sm dark:border-warning-500/40 dark:bg-warning-500/10">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-medium text-warning-700 dark:text-warning-300">동시 수정 충돌 {conflicts.length}건 — 내 입력은 저장되지 않았습니다</span>
                <button onClick={() => setConflicts([])} className="ml-auto text-warning-700 hover:underline dark:text-warning-300">
                  모두 닫기
                </button>
              </div>
              <ul className="space-y-1.5">
                {conflicts.map((c) => (
                  <li key={`${c.row_id}:${c.field}`} className="fg-base flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{c.row_label || `#${c.row_id}`}</span>
                    <span className="fg-muted">· {cols.find((x) => x.key === c.field)?.label || c.field}</span>
                    <span className="rounded-control bg-white px-1.5 py-0.5 dark:bg-white/10">내 값: {c.mine || "(비어 있음)"}</span>
                    <span className="rounded-control bg-white px-1.5 py-0.5 dark:bg-white/10">
                      현재 값: {c.theirs || "(비어 있음)"}
                      {c.actor_name ? ` (${c.actor_name})` : ""}
                    </span>
                    <button onClick={() => overwriteConflict(c)} className="rounded-control bg-warning-600 px-2 py-0.5 font-medium text-white hover:bg-warning-700">
                      내 값으로 덮어쓰기
                    </button>
                    <button onClick={() => dismissConflict(c)} className="rounded-control border border-warning-400 px-2 py-0.5 font-medium text-warning-700 dark:text-warning-300">
                      현재 값 유지
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isNarrow ? (
            /* 폰: 카드 목록. 표의 가로 스크롤·잘림 대신 모든 칸을 한 카드에 펼친다. */
            <div ref={cardsRef} className="space-y-2.5">
              {loading ? (
                <div className="empty-state">불러오는 중...</div>
              ) : view.length === 0 ? (
                <div className="surface-card empty-state">항목이 없습니다</div>
              ) : (
                view.map((row, r) => {
                  const head = new Set<ColKey>(["name", "manufacturer", "is_opened"]);
                  const body = cols.filter((c) => !head.has(c.key));
                  const flashed = cols.some((c) => flash[`${row.id}:${c.key}`]);
                  return (
                    <div
                      key={row.id}
                      data-rowid={row.id}
                      className={`surface-card relative flex items-stretch transition-colors ${dropLineClass(r)} ${
                        drag?.id === row.id ? "opacity-40" : ""
                      } ${flashed ? "ring-2 ring-warning-300 dark:ring-warning-500/40" : ""}`}
                    >
                    <button
                      onClick={() => openSheet(row)}
                      className="block min-w-0 flex-1 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-white/[0.04]"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {cols.some((c) => c.key === "manufacturer") && row.manufacturer && (
                          <span className={`chip-quiet ${manufacturerTone(row.manufacturer)}`}>{row.manufacturer}</span>
                        )}
                        <span className="fg-strong min-w-0 flex-1 truncate text-ui-xl font-bold">
                          {row.name || <span className="fg-subtle font-normal">이름 없음</span>}
                        </span>
                        {cols.some((c) => c.key === "is_opened") && (
                          <span
                            className={`shrink-0 rounded-control px-2 py-0.5 text-ui-xs font-medium ${
                              row.is_opened
                                ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                                : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                            }`}
                          >
                            {row.is_opened ? "개봉" : "미개봉"}
                          </span>
                        )}
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {body.map((c) => {
                          const v = cellText(row, c);
                          const wide = c.key === "notes" || c.key === "location";
                          return (
                            <div key={c.key} className={wide ? "col-span-2" : ""}>
                              <dt className="fg-muted text-ui-xs">{c.label}</dt>
                              <dd
                                className={`whitespace-pre-wrap break-words text-ui-md leading-snug ${
                                  c.mono ? "font-mono" : ""
                                } ${BOLD_COLS.has(c.key) ? "fg-strong font-bold" : "fg-base"} ${v ? "" : "fg-subtle font-normal"}`}
                              >
                                {v || "—"}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </button>
                    {!sort && (
                      <span
                        role="button"
                        aria-label="끌어서 순서 바꾸기"
                        title="끌어서 순서 바꾸기"
                        onPointerDown={(e) => onHandlePointerDown(e, row.id, r)}
                        onPointerMove={onHandlePointerMove}
                        onPointerUp={onHandlePointerUp}
                        onPointerCancel={onHandlePointerUp}
                        onClick={(e) => e.stopPropagation()}
                        className="fg-subtle flex w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center border-l border-gray-100 text-lg active:cursor-grabbing dark:border-gray-800"
                      >
                        ⋮⋮
                      </span>
                    )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <div
            ref={gridRef}
            onCopy={onCopy}
            onCut={onCut}
            onPaste={onPaste}
            className={`max-h-[70vh] min-h-[300px] overflow-auto rounded-card border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 sm:max-h-[calc(100vh-330px)] ${ac.bar}`}
          >
            {loading ? (
              <div className="empty-state">불러오는 중...</div>
            ) : (
              <table className="table-dense">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="w-6 border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900" />
                    <th className="w-10 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-1 py-2 text-center text-ui-xs font-medium tracking-[0.04em] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                      #
                    </th>
                    {cols.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        className={`${c.width} th-dense cursor-pointer select-none`}
                        title="클릭하여 정렬"
                      >
                        {c.label}
                        <span className="ml-1 text-[10px] opacity-70">
                          {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </th>
                    ))}
                    <th className="th-dense w-10" />
                  </tr>
                  <tr className="bg-white dark:bg-gray-900">
                    <th className="hairline border-b bg-white dark:bg-gray-900" />
                    <th className="hairline border-b bg-white px-1 py-1 dark:bg-gray-900" />
                    {cols.map((c) => (
                      <th key={c.key} className="hairline border-b px-1 py-1">
                        <input
                          value={filters[c.key] || ""}
                          onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                          placeholder="필터"
                          className="w-full rounded-control border border-gray-300 bg-white px-1.5 py-1 text-ui-xs font-normal text-gray-800 transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-600"
                        />
                      </th>
                    ))}
                    <th className="hairline border-b" />
                  </tr>
                </thead>
                <tbody>
                  {view.map((row, r) => (
                    <tr
                      key={row.id}
                      data-rowid={row.id}
                      className={`${r % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""} ${dropLineClass(r)} ${
                        drag?.id === row.id ? "opacity-40" : ""
                      }`}
                    >
                      <td className="hairline-soft border-b px-0 py-0 text-center text-ui-xs">
                        <span
                          role="button"
                          aria-label="끌어서 순서 바꾸기"
                          title={sort ? "정렬을 풀면 끌어서 옮길 수 있습니다" : "끌어서 순서 바꾸기"}
                          onPointerDown={(e) => onHandlePointerDown(e, row.id, r)}
                          onPointerMove={onHandlePointerMove}
                          onPointerUp={onHandlePointerUp}
                          onPointerCancel={onHandlePointerUp}
                          className={`fg-subtle inline-flex h-7 w-5 touch-none select-none items-center justify-center text-sm ${
                            sort ? "cursor-not-allowed opacity-30" : "cursor-grab active:cursor-grabbing"
                          }`}
                        >
                          ⋮⋮
                        </span>
                      </td>
                      <td className="hairline-soft border-b px-1 py-1 text-center text-ui-xs">
                        <button
                          onClick={() => {
                            setHistoryRow({ id: row.id, label: row.name || `#${row.id}` });
                            setHistoryOpen(true);
                            setHistoryKey((k) => k + 1);
                          }}
                          title={
                            row.updated_by_name
                              ? `마지막 수정: ${row.updated_by_name} — 클릭하면 이 행의 변경 내역`
                              : "이 행의 변경 내역 보기"
                          }
                          className="fg-subtle block w-full text-center tabular-nums transition-colors hover:text-gray-800 dark:hover:text-gray-100"
                        >
                          {r + 1}
                        </button>
                      </td>

                      {cols.map((col, c) => {
                        const key = `${row.id}:${col.key}`;
                        const flashed = flash[key];
                        const active = sel?.r === r && sel?.c === c;
                        const selected = inRange(r, c);
                        const base = `hairline-soft relative border-b px-1 py-0.5 ${
                          selected && rangeSize > 1 ? ac.selBg : ""
                        } ${active ? `ring-2 ring-inset ${ac.sel}` : ""} ${
                          flashed ? "bg-warning-50 dark:bg-warning-500/15" : ""
                        }`;
                        return (
                          <td
                            key={col.key}
                            className={base}
                            title={flashed ? `${flashed}님이 방금 수정` : undefined}
                          >
                            {col.type === "bool" ? (
                              <button
                                data-cell={`${r}-${c}`}
                                onFocus={() => {
                                  focusRef.current = { rowId: row.id, field: col.key };
                                  originalRef.current = cellText(row, col);
                                  setSel({ r, c, r2: r, c2: c });
                                }}
                                onBlur={() => {
                                  focusRef.current = null;
                                }}
                                onKeyDown={(e) => onCellKeyDown(e, r, c, row, col)}
                                onClick={() =>
                                  runEdits([{ row_id: row.id, field: "is_opened", old_value: row.is_opened, new_value: !row.is_opened }])
                                }
                                className={`w-full whitespace-nowrap rounded-control px-2 py-1.5 text-ui-xs font-medium focus:outline-none ${
                                  row.is_opened
                                    ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                                    : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                                }`}
                              >
                                {row.is_opened ? "개봉" : "미개봉"}
                              </button>
                            ) : (
                              <input
                                data-cell={`${r}-${c}`}
                                value={cellText(row, col)}
                                onChange={(e) => setLocal(row.id, col.key, e.target.value)}
                                onFocus={() => {
                                  focusRef.current = { rowId: row.id, field: col.key };
                                  originalRef.current = cellText(row, col);
                                  setSel({ r, c, r2: r, c2: c });
                                }}
                                onBlur={() => {
                                  commit(row.id, col);
                                  focusRef.current = null;
                                }}
                                onKeyDown={(e) => onCellKeyDown(e, r, c, row, col)}
                                className={`w-full px-1.5 py-1.5 text-ui focus:outline-none ${
                                  col.mono ? "font-mono text-xs" : ""
                                } ${BOLD_COLS.has(col.key) ? "font-bold" : ""} ${
                                  col.key === "manufacturer" && manufacturerTone(cellText(row, col))
                                    ? `rounded-control font-medium ${manufacturerTone(cellText(row, col))}`
                                    : "fg-base bg-transparent"
                                }`}
                              />
                            )}
                          </td>
                        );
                      })}

                      <td className="hairline-soft border-b px-1 py-0.5 text-center">
                        <button
                          onClick={() => removeRows([row.id])}
                          title="행 삭제"
                          aria-label="행 삭제"
                          className="inline-flex h-6 w-6 items-center justify-center text-error-500 transition-colors hover:text-error-600"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {view.length === 0 && (
                    <tr>
                      <td colSpan={cols.length + 3} className="empty-state">
                        항목이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          )}

          <p className="fg-subtle text-ui-xs">
            {view.length}개 행 {rangeSize > 1 ? `· ${rangeSize}칸 선택됨` : ""}
          </p>
        </div>

        {historyOpen && (
          <div className="h-[420px] w-full shrink-0 xl:h-[calc(100vh-330px)] xl:w-96">
            <HistoryPanel
              category={category}
              rowId={historyRow?.id}
              rowLabel={historyRow?.label}
              refreshKey={historyKey}
              onClose={() => setHistoryOpen(false)}
              onClearRowFilter={() => setHistoryRow(null)}
            />
          </div>
        )}
      </div>

      {/* 폰 전용 행 편집 시트. 카드를 누르면 행 전체를 큰 입력칸으로 고친다.
          저장은 인라인 편집과 같은 runEdits 경로라 충돌 감지·실행취소·변경 이력이 그대로 동작한다. */}
      {isNarrow && sheet && (() => {
        // ref가 아니라 state로 찾는다 — 시트가 열려 있는 동안 다른 사람이 이름을 바꾸면 머리글도 따라 갱신돼야 한다.
        const row = rows.find((r) => r.id === sheet.rowId);
        if (!row) return null;
        const dirty = cols.some((c) => (c.type === "bool" ? row.is_opened : cellText(row, c)) !== sheet.draft[c.key]);
        const setDraft = (key: ColKey, value: string | boolean) =>
          setSheet((s) => (s ? { ...s, draft: { ...s.draft, [key]: value } } : s));
        const title = String(sheet.draft.name || "") || row.name || (sheet.isNew ? "새 항목" : `#${row.id}`);
        return (
          <>
            <div className="fixed inset-0 z-40 bg-gray-900/30 sm:hidden" onClick={cancelSheet} />
            <div className="surface-card fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-b-none border-x-0 border-b-0 shadow-pop sm:hidden">
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div className="min-w-0 flex-1">
                  <div className="fg-strong truncate text-ui-lg font-semibold">{title}</div>
                  <div className="fg-muted text-ui-xs">
                    {itemType}
                    {row.updated_by_name ? ` · 마지막 수정 ${row.updated_by_name}` : ""}
                  </div>
                </div>
                <button onClick={cancelSheet} aria-label="닫기" className="icon-btn">
                  ×
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {cols.map((c) => {
                  const v = sheet.draft[c.key];
                  if (c.type === "bool") {
                    return (
                      <div key={c.key}>
                        <div className="fg-muted mb-1 text-ui-xs font-medium">{c.label}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDraft(c.key, true)}
                            className={`h-11 flex-1 rounded-control text-ui font-medium ${
                              v === true
                                ? "bg-warning-50 text-warning-700 ring-2 ring-warning-400 dark:bg-warning-500/15 dark:text-warning-400"
                                : "surface-inset fg-muted"
                            }`}
                          >
                            개봉
                          </button>
                          <button
                            onClick={() => setDraft(c.key, false)}
                            className={`h-11 flex-1 rounded-control text-ui font-medium ${
                              v === false
                                ? "bg-success-50 text-success-600 ring-2 ring-success-400 dark:bg-success-500/15 dark:text-success-400"
                                : "surface-inset fg-muted"
                            }`}
                          >
                            미개봉
                          </button>
                        </div>
                      </div>
                    );
                  }
                  const text = typeof v === "string" ? v : "";
                  return (
                    <label key={c.key} className="block">
                      <span className="fg-muted mb-1 block text-ui-xs font-medium">{c.label}</span>
                      {c.key === "notes" ? (
                        <textarea
                          rows={3}
                          value={text}
                          onChange={(e) => setDraft(c.key, e.target.value)}
                          placeholder={`${c.label} 입력`}
                          className="field-auto w-full resize-none"
                        />
                      ) : (
                        <input
                          value={text}
                          onChange={(e) => setDraft(c.key, e.target.value)}
                          placeholder={`${c.label} 입력`}
                          className={`field w-full ${c.mono ? "font-mono" : ""}`}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                <button onClick={() => removeRows([row.id])} className="btn btn-danger !px-3">
                  삭제
                </button>
                <button
                  onClick={() => {
                    setSheet(null);
                    setHistoryRow({ id: row.id, label: row.name || `#${row.id}` });
                    setHistoryOpen(true);
                    setHistoryKey((k) => k + 1);
                  }}
                  className="btn btn-ghost !px-3"
                >
                  변경 내역
                </button>
                <button onClick={cancelSheet} className="btn btn-default ml-auto">
                  취소
                </button>
                <button onClick={saveSheet} className="btn btn-primary !px-5">
                  {dirty ? "저장" : "닫기"}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
