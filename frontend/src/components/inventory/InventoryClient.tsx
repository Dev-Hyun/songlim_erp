"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  saveCells,
  syncEquipment,
} from "./api";

const SUBTYPES: Record<"지멘스" | "타사", string[]> = {
  지멘스: ["장비", "EKG", "프로브"],
  타사: ["신품", "중고", "데모"],
};

const POLL_MS = 3000;

type ColKey =
  | "grade" | "name" | "serial_no" | "notes" | "location"
  | "manufacture_date" | "manufacturer" | "purchase_price" | "purchase_from" | "is_opened";

interface Col {
  key: ColKey;
  label: string;
  type: "text" | "grade" | "bool";
  width: string;
  mono?: boolean;
}

// 컬럼 구성은 기존 화면과 동일(지멘스=등급·개봉 포함, 타사=제조사·매입정보 포함).
const COLUMNS: Record<"지멘스" | "타사", Col[]> = {
  지멘스: [
    { key: "grade", label: "등급", type: "grade", width: "w-[70px]" },
    { key: "name", label: "이름", type: "text", width: "w-[160px]" },
    { key: "serial_no", label: "S/N", type: "text", width: "w-[140px]", mono: true },
    { key: "notes", label: "비고", type: "text", width: "w-[220px]" },
    { key: "location", label: "위치", type: "text", width: "w-[170px]" },
    { key: "manufacture_date", label: "제조년월", type: "text", width: "w-[130px]" },
    { key: "is_opened", label: "개봉", type: "bool", width: "w-[80px]" },
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

const GRADE_COLOR: Record<string, string> = {
  L: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  H: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
};

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
    category, item_type: itemType, grade: null, name: "", serial_no: null, location: null,
    notes: null, manufacture_date: null, manufacturer: null, purchase_price: null,
    purchase_from: null, is_opened: false,
  };
}

function byId(rows: InvEquipmentRow[]): Map<number, InvEquipmentRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

function sortedRows(map: Map<number, InvEquipmentRow>): InvEquipmentRow[] {
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export default function InventoryClient({ category }: { category: "지멘스" | "타사" }) {
  const { user } = useAuth();
  const cols = COLUMNS[category];

  const [rows, setRows] = useState<InvEquipmentRow[]>([]);
  const [itemType, setItemType] = useState(SUBTYPES[category][0]);
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

  const gridRef = useRef<HTMLDivElement>(null);
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
      setFocusRowId(created.id);
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
    setHistoryKey((k) => k + 1);
  }

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
      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="전체 검색..."
          className="field w-48"
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
            className="btn btn-default"
          >
            실행취소
          </button>
          <button
            onClick={() => {
              setHistoryRow(null);
              setHistoryOpen((v) => !v);
            }}
            className={`btn ${historyOpen ? "btn-primary" : "btn-default"}`}
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
          <button onClick={addRow} className="btn btn-primary">
            + 행 추가
          </button>
        </div>

        <p className="fg-subtle w-full text-ui-xs">
          Tab/Enter/화살표로 칸 이동 · Shift+화살표로 범위 선택 · Ctrl+C/X/V 복사·잘라내기·붙여넣기(엑셀·구글시트와 호환) ·
          Delete로 범위 비우기 · Ctrl+Z 실행취소 · 수정 즉시 자동 저장되고 {POLL_MS / 1000}초마다 다른 사람 변경이 반영됩니다
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

          <div
            ref={gridRef}
            onCopy={onCopy}
            onCut={onCut}
            onPaste={onPaste}
            className={`max-h-[calc(100vh-330px)] min-h-[300px] overflow-auto rounded-card border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900 ${ac.bar}`}
          >
            {loading ? (
              <div className="empty-state">불러오는 중...</div>
            ) : (
              <table className="table-dense">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className="sticky left-0 z-30 w-10 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-1 py-2 text-center text-ui-xs font-medium tracking-[0.04em] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
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
                    <th className="hairline sticky left-0 z-30 border-b bg-white px-1 py-1 dark:bg-gray-900" />
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
                    <tr key={row.id} data-rowid={row.id} className={r % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""}>
                      <td
                        className={`hairline-soft sticky left-0 z-10 border-b px-1 py-1 text-center text-ui-xs ${
                          r % 2 === 1 ? "bg-gray-50 dark:bg-gray-900" : "bg-white dark:bg-gray-900"
                        }`}
                      >
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
                          className="fg-subtle w-full transition-colors hover:text-gray-800 dark:hover:text-gray-100"
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
                          <td key={col.key} className={base} title={flashed ? `${flashed}님이 방금 수정` : undefined}>
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
                                className={`w-full rounded-control px-2 py-1.5 text-ui-xs font-medium focus:outline-none ${
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
                                className={
                                  col.type === "grade"
                                    ? `w-full rounded-control px-1 py-1.5 text-center text-xs font-medium focus:outline-none ${
                                        row.grade && GRADE_COLOR[row.grade]
                                          ? GRADE_COLOR[row.grade]
                                          : "surface-inset fg-muted"
                                      }`
                                    : `fg-base w-full bg-transparent px-1.5 py-1.5 text-ui focus:outline-none ${
                                        col.mono ? "font-mono text-xs" : ""
                                      }`
                                }
                              />
                            )}
                          </td>
                        );
                      })}

                      <td className="hairline-soft border-b px-1 py-0.5 text-center">
                        <button onClick={() => removeRows([row.id])} title="행 삭제" className="text-error-500 transition-colors hover:text-error-600">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {view.length === 0 && (
                    <tr>
                      <td colSpan={cols.length + 2} className="empty-state">
                        항목이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

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
    </div>
  );
}
