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
}

export type InvEquipmentPayload = Omit<InvEquipmentRow, "id">;

export async function fetchEquipment(category: string): Promise<InvEquipmentRow[]> {
  const res = await fetch(`${API}/api/inventory/equipment?category=${encodeURIComponent(category)}`, { credentials: "include" });
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

export async function deleteEquipment(id: number) {
  await fetch(`${API}/api/inventory/equipment/${id}`, { method: "DELETE", credentials: "include" });
}
