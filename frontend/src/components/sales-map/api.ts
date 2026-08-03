import type { EquipmentCategory, HospitalDetail, HospitalListItem, SalesNoteItem, PersonalMemoItem } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export async function fetchHospitals(params: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  category: EquipmentCategory;
  sido?: string;
  sigungu?: string;
  maker?: string;
  model?: string;
  nameSearch?: string;
  mapOnly: boolean;
  sort?: "dist" | "maker" | "name";
}): Promise<HospitalListItem[]> {
  const qs = new URLSearchParams();
  if (params.lat !== undefined) qs.set("lat", String(params.lat));
  if (params.lng !== undefined) qs.set("lng", String(params.lng));
  if (params.radiusKm !== undefined) qs.set("radius_km", String(params.radiusKm));
  qs.set("category", params.category);
  if (params.sido) qs.set("sido", params.sido);
  if (params.sigungu) qs.set("sigungu", params.sigungu);
  if (params.maker) qs.set("maker", params.maker);
  if (params.model) qs.set("model", params.model);
  if (params.nameSearch) qs.set("name_search", params.nameSearch);
  qs.set("map_only", String(params.mapOnly));
  if (params.sort) qs.set("sort", params.sort);

  const res = await fetch(`${API}/api/hospitals?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("병원 목록 조회 실패");
  return res.json();
}

export async function fetchHospitalDetail(id: number): Promise<HospitalDetail> {
  const res = await fetch(`${API}/api/hospital/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("병원 상세 조회 실패");
  return res.json();
}

export async function fetchSidoList(): Promise<string[]> {
  const res = await fetch(`${API}/api/regions/sido`, { credentials: "include" });
  if (!res.ok) throw new Error("시도 목록 조회 실패");
  return res.json();
}

export async function fetchSigunguList(sido: string): Promise<string[]> {
  const res = await fetch(`${API}/api/regions/sigungu?sido=${encodeURIComponent(sido)}`, { credentials: "include" });
  if (!res.ok) throw new Error("시군구 목록 조회 실패");
  return res.json();
}

export async function fetchEquipmentCatalog(
  category: EquipmentCategory
): Promise<{ manufacturer: string | null; model: string | null }[]> {
  const res = await fetch(`${API}/api/equipment/catalog?category=${category}`, { credentials: "include" });
  if (!res.ok) throw new Error("장비 카탈로그 조회 실패");
  return res.json();
}

export async function registerManualEquipment(payload: {
  hospital_id: number;
  category: EquipmentCategory;
  manufacturer: string;
  model: string;
  year: number;
  eq_count?: number;
}): Promise<{ id: number }> {
  const res = await fetch(`${API}/api/equipment/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("장비 등록 실패");
  return res.json();
}

export async function updateManualEquipment(
  equipmentId: number,
  payload: { manufacturer: string; model: string; year: number; eq_count?: number }
): Promise<{ id: number }> {
  const res = await fetch(`${API}/api/equipment/manual/${equipmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("장비 수정 실패");
  return res.json();
}

export async function deleteManualEquipment(equipmentId: number): Promise<void> {
  const res = await fetch(`${API}/api/equipment/manual/${equipmentId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("장비 삭제 실패");
}

export async function fetchSalesNotes(hospitalId: number): Promise<SalesNoteItem[]> {
  const res = await fetch(`${API}/api/sales-notes?hospital_id=${hospitalId}`, { credentials: "include" });
  if (!res.ok) throw new Error("영업노트 조회 실패");
  return res.json();
}

export async function fetchAllSalesNotes(params?: {
  q?: string;
  sort?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
}): Promise<SalesNoteItem[]> {
  const p = new URLSearchParams();
  if (params?.q) p.set("q", params.q);
  if (params?.sort) p.set("sort", params.sort);
  if (params?.dateFrom) p.set("date_from", params.dateFrom);
  if (params?.dateTo) p.set("date_to", params.dateTo);
  const res = await fetch(`${API}/api/sales-notes?${p.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("영업노트 조회 실패");
  return res.json();
}

export async function fetchPersonalMemos(): Promise<PersonalMemoItem[]> {
  const res = await fetch(`${API}/api/personal-memos`, { credentials: "include" });
  if (!res.ok) throw new Error("메모 조회 실패");
  return res.json();
}

export async function createPersonalMemo(content: string): Promise<{ id: number }> {
  const res = await fetch(`${API}/api/personal-memos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("메모 작성 실패");
  return res.json();
}

export async function updatePersonalMemo(id: number, content: string): Promise<void> {
  const res = await fetch(`${API}/api/personal-memos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("메모 수정 실패");
}

export async function deletePersonalMemo(id: number): Promise<void> {
  const res = await fetch(`${API}/api/personal-memos/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("메모 삭제 실패");
}

export async function createSalesNote(payload: {
  hospital_id: number;
  visit_date?: string;
  content: string;
}): Promise<{ id: number }> {
  const res = await fetch(`${API}/api/sales-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("영업노트 작성 실패");
  return res.json();
}

export async function updateSalesNote(
  id: number,
  payload: { visit_date?: string | null; content: string }
): Promise<void> {
  const res = await fetch(`${API}/api/sales-notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("영업노트 수정 실패");
}

export async function deleteSalesNote(id: number): Promise<void> {
  const res = await fetch(`${API}/api/sales-notes/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("영업노트 삭제 실패");
}
