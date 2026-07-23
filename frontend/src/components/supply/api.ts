const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface CatalogItem {
  id: number;
  name: string;
  spec: string | null;
  category: string;
  unit: string;
  price: number;
  base_price: number;
  has_special_price: boolean;
  description: string | null;
  image_key: string | null;
  is_favorite: boolean;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface OrderItem {
  id: number;
  catalog_id: number | null;
  name: string;
  unit: string;
  unit_price: number;
  qty: number;
  subtotal: number;
}

export interface SupplyOrder {
  id: number;
  status: string;
  tracking_number: string | null;
  total_amount: number;
  discount_rate_applied: number | null;
  gift_note: string | null;
  tax_invoice_status: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  hospital_name?: string;
  hospital_profile_id?: number;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "요청 실패");
  return res.json();
}

// ── 병원측 ──
export const fetchCatalog = (category?: string): Promise<CatalogItem[]> =>
  fetch(`${API}/api/supply/catalog${category ? `?category=${encodeURIComponent(category)}` : ""}`, { credentials: "include" }).then((r) => j(r));

export const fetchCategories = (): Promise<CategoryCount[]> =>
  fetch(`${API}/api/supply/categories`, { credentials: "include" }).then((r) => j(r));

export const addFavorite = (catalog_id: number) =>
  fetch(`${API}/api/supply/favorites`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ catalog_id }) }).then((r) => j(r));

export const removeFavorite = (catalog_id: number) =>
  fetch(`${API}/api/supply/favorites/${catalog_id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));

export const createOrder = (items: { catalog_id: number; qty: number }[]): Promise<{ id: number; total_amount: number }> =>
  fetch(`${API}/api/supply/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ items }) }).then((r) => j(r));

export const fetchMyOrders = (params?: { status?: string; date_from?: string; date_to?: string }): Promise<SupplyOrder[]> => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  return fetch(`${API}/api/supply/orders?${qs.toString()}`, { credentials: "include" }).then((r) => j(r));
};

export const fetchMyOrder = (id: number): Promise<SupplyOrder> =>
  fetch(`${API}/api/supply/orders/${id}`, { credentials: "include" }).then((r) => j(r));

export const fetchReorderItems = (id: number): Promise<{ catalog_id: number; name: string; qty: number }[]> =>
  fetch(`${API}/api/supply/orders/${id}/reorder-items`, { credentials: "include" }).then((r) => j(r));

// ── 관리자측 ──
export interface AdminCatalogItem {
  id: number;
  name: string;
  spec: string | null;
  category: string;
  unit: string;
  unit_price: number;
  description: string | null;
  image_key: string | null;
  sort_order: number;
  is_active: boolean;
}

export const adminFetchCatalog = (): Promise<AdminCatalogItem[]> =>
  fetch(`${API}/api/supply/admin/catalog`, { credentials: "include" }).then((r) => j(r));

export interface CatalogInput {
  name: string;
  spec?: string;
  category: string;
  unit: string;
  unit_price: number;
  description?: string;
  image_key?: string;
  sort_order?: number;
  is_active?: boolean;
}

export const adminCreateCatalog = (payload: CatalogInput) =>
  fetch(`${API}/api/supply/admin/catalog`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }).then((r) => j(r));

export const adminUpdateCatalog = (id: number, payload: CatalogInput) =>
  fetch(`${API}/api/supply/admin/catalog/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }).then((r) => j(r));

export const adminDeleteCatalog = (id: number) =>
  fetch(`${API}/api/supply/admin/catalog/${id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));

export interface AdminHospital {
  id: number;
  hospital_name: string;
  hospital_type: string;
  discount_grade_code: string | null;
  gift_grade_code: string | null;
}

export const adminFetchHospitals = (): Promise<AdminHospital[]> =>
  fetch(`${API}/api/supply/admin/hospitals`, { credentials: "include" }).then((r) => j(r));

export interface HospitalDetail {
  id: number;
  hospital_name: string;
  hospital_type: string;
  hospital_dept: string | null;
  hospital_address: string | null;
  hospital_tel: string | null;
  business_reg_no: string | null;
  ceo_name: string | null;
  ceo_phone: string | null;
  discount_grade_code: string | null;
  gift_grade_code: string | null;
  matched_hospital_id: number | null;
  equipment: { id: number; category: string; year: number; manufacturer: string | null; model: string | null; eq_count: number; source: string }[];
  sales_notes: { id: number; visit_date: string | null; content: string; created_by_name: string }[];
}

export const adminFetchHospitalDetail = (hid: number): Promise<HospitalDetail> =>
  fetch(`${API}/api/supply/admin/hospitals/${hid}/detail`, { credentials: "include" }).then((r) => j(r));

export const adminSetHospitalGrades = (hid: number, payload: { discount_grade_code: string | null; gift_grade_code: string | null }) =>
  fetch(`${API}/api/supply/admin/hospitals/${hid}/grades`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }).then((r) => j(r));

export interface PriceOverride {
  id: number;
  catalog_id: number;
  hospital_profile_id: number;
  override_price: number;
}

export const adminFetchPriceOverrides = (hospital_profile_id?: number): Promise<PriceOverride[]> =>
  fetch(`${API}/api/supply/admin/price-overrides${hospital_profile_id ? `?hospital_profile_id=${hospital_profile_id}` : ""}`, { credentials: "include" }).then((r) => j(r));

export const adminUpsertPriceOverride = (payload: { catalog_id: number; hospital_profile_id: number; override_price: number }) =>
  fetch(`${API}/api/supply/admin/price-overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }).then((r) => j(r));

export const adminDeletePriceOverride = (id: number) =>
  fetch(`${API}/api/supply/admin/price-overrides/${id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));

export interface CategoryAccessRow {
  id: number;
  category: string;
  hospital_type: string;
}

export const adminFetchCategoryAccess = (): Promise<CategoryAccessRow[]> =>
  fetch(`${API}/api/supply/admin/category-access`, { credentials: "include" }).then((r) => j(r));

export const adminAddCategoryAccess = (payload: { category: string; hospital_type: string }) =>
  fetch(`${API}/api/supply/admin/category-access`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) }).then((r) => j(r));

export const adminRemoveCategoryAccess = (id: number) =>
  fetch(`${API}/api/supply/admin/category-access/${id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));

export const adminFetchOrders = (params?: { status?: string; hospital_profile_id?: number; date_from?: string; date_to?: string }): Promise<SupplyOrder[]> => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.hospital_profile_id) qs.set("hospital_profile_id", String(params.hospital_profile_id));
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  return fetch(`${API}/api/supply/admin/orders?${qs.toString()}`, { credentials: "include" }).then((r) => j(r));
};

export const adminSetOrderStatus = (id: number, status: string) =>
  fetch(`${API}/api/supply/admin/orders/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) }).then((r) => j(r));

export const adminSetTracking = (id: number, tracking_number: string) =>
  fetch(`${API}/api/supply/admin/orders/${id}/tracking`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ tracking_number }) }).then((r) => j(r));

export const adminSetTaxInvoiceStatus = (id: number, tax_invoice_status: string) =>
  fetch(`${API}/api/supply/admin/orders/${id}/tax-invoice`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ tax_invoice_status }) }).then((r) => j(r));

export interface GradeRow {
  grade_code: string;
  grade_type: string;
  label: string;
  discount_rate: number | null;
  gift_policy_note: string | null;
  sort_order: number;
}

export const fetchGrades = (): Promise<GradeRow[]> =>
  fetch(`${API}/api/admin/grades`, { credentials: "include" }).then((r) => j(r));
