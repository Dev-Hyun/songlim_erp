const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface InvEquipmentRow {
  id: number;
  category: string;
  item_type: string;
  grade: string | null;
  name: string;
  serial_no: string | null;
  location: string | null;
  notes: string | null;
  manufacture_date: string | null;
  manufacturer: string | null;
  purchase_price: string | null;
  purchase_from: string | null;
  is_opened: boolean;
  updated_at?: string | null;
  updated_by?: number | null;
  updated_by_name?: string | null;
}

export type InvEquipmentPayload = Omit<InvEquipmentRow, "id" | "updated_at" | "updated_by" | "updated_by_name">;

export type CellValue = string | boolean | null;

export interface CellEdit {
  row_id: number;
  field: string;
  old_value: CellValue;
  new_value: CellValue;
  force?: boolean;
}

export interface CellConflict {
  row_id: number;
  field: string;
  row_label: string;
  mine: string;
  theirs: string;
  theirs_raw: CellValue;
  base: string;
  actor_name: string | null;
}

export interface CellSaveResult {
  updated: InvEquipmentRow[];
  conflicts: CellConflict[];
  missing: number[];
  server_time: string;
}

export interface SyncResult {
  server_time: string;
  full: boolean;
  rows: InvEquipmentRow[];
  deleted: number[];
}

export interface ChangeLogEntry {
  id: number;
  row_id: number;
  row_label: string | null;
  action: "create" | "update" | "delete";
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  actor_name: string | null;
  created_at: string;
}

export async function fetchEquipment(category: string): Promise<InvEquipmentRow[]> {
  const res = await fetch(`${API}/api/inventory/equipment?category=${encodeURIComponent(category)}`, { credentials: "include" });
  return res.json();
}

/** 폴링용 델타 동기화. since를 주면 그 이후 바뀐 행/삭제된 행만 돌려준다. */
export async function syncEquipment(category: string, since: string | null): Promise<SyncResult> {
  const qs = new URLSearchParams({ category });
  if (since) qs.set("since", since);
  const res = await fetch(`${API}/api/inventory/equipment/sync?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("동기화 실패");
  return res.json();
}

export async function createEquipment(payload: InvEquipmentPayload): Promise<InvEquipmentRow> {
  const res = await fetch(`${API}/api/inventory/equipment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("등록 실패");
  return res.json();
}

export async function updateEquipment(id: number, payload: InvEquipmentPayload): Promise<InvEquipmentRow> {
  const res = await fetch(`${API}/api/inventory/equipment/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("수정 실패");
  return res.json();
}

/** 셀 단위 저장. 붙여넣기처럼 여러 칸이 한 번에 바뀌어도 요청 1번. */
export async function saveCells(edits: CellEdit[]): Promise<CellSaveResult> {
  const res = await fetch(`${API}/api/inventory/equipment/cells`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ edits }),
  });
  if (!res.ok) throw new Error("저장 실패");
  return res.json();
}

export async function deleteEquipment(id: number) {
  await fetch(`${API}/api/inventory/equipment/${id}`, { method: "DELETE", credentials: "include" });
}

export async function fetchHistory(params: { category?: string; rowId?: number; limit?: number }): Promise<ChangeLogEntry[]> {
  const qs = new URLSearchParams({ table: "inv_equipment" });
  if (params.category) qs.set("category", params.category);
  if (params.rowId !== undefined) qs.set("row_id", String(params.rowId));
  qs.set("limit", String(params.limit ?? 200));
  const res = await fetch(`${API}/api/inventory/history?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("이력 조회 실패");
  return res.json();
}
