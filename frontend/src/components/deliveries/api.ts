import type { DeliveryDetail, DeliveryItemRow, DeliveryListItem, SiteType } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export async function fetchDeliveries(): Promise<DeliveryListItem[]> {
  const res = await fetch(`${API}/api/deliveries`, { credentials: "include" });
  return res.json();
}

export interface DeliveryCreatePayload {
  hospital_name: string;
  hospital_type?: string;
  installation_date?: string;
  installation_location?: string;
  rep_doctor?: string;
  address?: string;
  person_in_charge?: string;
  site_type: SiteType;
  warranty_start?: string;
  warranty_end?: string;
  maintenance?: string;
  demo_result?: string;
  items?: { description?: string; serial_no?: string; price?: number; sys_id?: string }[];
}

export async function createDelivery(payload: DeliveryCreatePayload): Promise<DeliveryListItem> {
  const res = await fetch(`${API}/api/deliveries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("납품 건 생성 실패");
  return res.json();
}

export async function fetchDeliveryDetail(id: number): Promise<DeliveryDetail> {
  const res = await fetch(`${API}/api/deliveries/${id}`, { credentials: "include" });
  return res.json();
}

export async function updateDelivery(
  id: number,
  payload: Partial<{
    hospital_name: string;
    hospital_type: string;
    installation_date: string;
    installation_location: string;
    rep_doctor: string;
    address: string;
    person_in_charge: string;
    site_type: SiteType;
    warranty_start: string;
    warranty_end: string;
    maintenance: string;
    demo_result: string;
    items: { description?: string; serial_no?: string; price?: number; sys_id?: string }[];
  }>
) {
  const res = await fetch(`${API}/api/deliveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("납품 건 수정 실패");
  return res.json();
}

export async function deleteDelivery(id: number) {
  await fetch(`${API}/api/deliveries/${id}`, { method: "DELETE", credentials: "include" });
}

export async function addComment(id: number, content: string) {
  const res = await fetch(`${API}/api/deliveries/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function uploadPhoto(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/deliveries/${id}/photos`, { method: "POST", credentials: "include", body: form });
  return res.json();
}

export function photoUrl(deliveryId: number, photoId: number) {
  return `${API}/api/deliveries/${deliveryId}/photos/${photoId}/image`;
}

export type { DeliveryItemRow };
