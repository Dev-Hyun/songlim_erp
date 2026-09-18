const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export type MedMeta = {
  /** 심평원 전체 장비군(195 대분류). rows = 보유 행수, 많은 순 — 단 레거시 6종이 앞에 온다. */
  categories: { value: string; label: string; rows: number }[];
  years: number[];
  sidos: string[];
  types: { value: string; label: string; count: number }[];
  type_groups: { value: string; label: string }[];
};

export type EquipmentLine = {
  category: string;
  label: string;
  manufacturer: string | null;
  model: string | null;
  count: number;
};

export type EquipmentSearchItem = {
  hospital_id: number;
  name: string;
  type: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_member: boolean;
  matched_units: number;
  matched_lines: number;
  equipment: EquipmentLine[];
  matched_equipment: EquipmentLine[];
};

export type EquipmentSearchResult = {
  total: number;
  total_units: number;
  page: number;
  page_size: number;
  items: EquipmentSearchItem[];
};

export type CategorySummary = {
  category: string;
  label: string;
  hospitals: number;
  units: number;
  models: number;
};

export type ManufacturerRow = { manufacturer: string; hospitals: number; units: number };
export type ModelRow = {
  model: string;
  manufacturer: string | null;
  category: string;
  hospitals: number;
  units: number;
};

/** 개설 현황 기간 프리셋 — 서버(med_stats.PERIOD_DAYS/PERIOD_YEARS)와 값이 같아야 한다. */
export type OpeningsPeriod = "7d" | "30d" | "90d" | "1y" | "3y" | "5y" | "all";

export type OpeningsSummary = {
  period: string;
  start: string | null;
  end: string;
  prev_start: string | null;
  prev_end: string | null;
  total_hospitals: number;
  with_estb_date: number;
  missing_estb_date: number;
  opened: number;
  opened_prev: number | null;
  delta: number | null;
  latest_estb_date: string | null;
  /** 폐업·휴업 일자는 심평원 병원정보서비스에 없다 — 항상 false. */
  closures_available: boolean;
};

export type OpeningsTrend = {
  granularity: "day" | "month" | "year";
  start: string;
  end: string;
  /** bucket: 일별 YYYY-MM-DD / 월별 YYYY-MM / 연별 YYYY */
  points: { bucket: string; count: number }[];
};

export type RegionOpenings = {
  level: "sido" | "sigungu";
  period: string;
  start: string | null;
  end: string;
  rows: { region: string; total: number; opened: number }[];
};

export type NewHospital = {
  hospital_id: number;
  name: string;
  type: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  estb_date: string | null;
};

export type DistributionRegion = {
  region: string;
  hospitals: number;
  eq_hospitals: number;
  eq_share: number;
  units: number;
  units_per_100: number;
  lat: number | null;
  lng: number | null;
};

export type HospitalRow = {
  hospital_id: number;
  name: string;
  type: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type Paged<T> = { total: number; page: number; page_size: number; items: T[] };

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

async function get<T>(path: string, params: Record<string, string | number | undefined | null> = {}): Promise<T> {
  const query = qs(params);
  const res = await fetch(`${API}/api/med${path}${query ? `?${query}` : ""}`, { credentials: "include" });
  if (!res.ok) {
    let detail = "조회에 실패했습니다";
    try {
      detail = (await res.json())?.detail || detail;
    } catch {
      /* 응답 본문이 JSON이 아닌 경우는 기본 메시지 사용 */
    }
    throw new Error(detail);
  }
  return res.json();
}

export const fetchMedMeta = () => get<MedMeta>("/meta");
export const fetchMedSigungu = (sido: string) => get<string[]>("/regions/sigungu", { sido });

export const fetchEquipmentSearch = (p: {
  year: number;
  category?: string;
  manufacturer?: string;
  model?: string;
  sido?: string;
  sigungu?: string;
  type_group?: string;
  hospital_q?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}) => get<EquipmentSearchResult>("/equipment/search", p);

export const fetchEquipmentByCategory = (p: {
  year?: number;
  sido?: string;
  sigungu?: string;
  type_group?: string;
}) => get<CategorySummary[]>("/equipment/by-category", p);

export const fetchManufacturers = (p: { category?: string; year?: number }) =>
  get<ManufacturerRow[]>("/equipment/manufacturers", p);

export const fetchModels = (p: {
  category?: string;
  year?: number;
  manufacturer?: string;
  q?: string;
  limit?: number;
}) => get<ModelRow[]>("/equipment/models", p);

export type OpeningsFilter = {
  period: OpeningsPeriod;
  sido?: string;
  sigungu?: string;
  type_group?: string;
};

export const fetchOpeningsSummary = (p: OpeningsFilter) => get<OpeningsSummary>("/openings/summary", p);

export const fetchOpeningsTrend = (p: OpeningsFilter) => get<OpeningsTrend>("/openings/trend", p);

export const fetchOpeningsByRegion = (p: { period: OpeningsPeriod; sido?: string; type_group?: string }) =>
  get<RegionOpenings>("/openings/by-region", p);

export const fetchNewHospitals = (p: OpeningsFilter & { page?: number; page_size?: number }) =>
  get<Paged<NewHospital> & { period: string; start: string | null; end: string }>("/openings/new-list", p);

export const fetchDistributionRegions = (p: {
  sido?: string;
  type_group?: string;
  category?: string;
  year?: number;
}) => get<{ level: "sido" | "sigungu"; year: number; rows: DistributionRegion[] }>("/distribution/regions", p);

export const fetchDistributionTypes = (p: { sido?: string; sigungu?: string }) =>
  get<{ total: number; rows: { type: string; count: number; share: number }[] }>("/distribution/types", p);

export const fetchDistributionHospitals = (p: {
  sido?: string;
  sigungu?: string;
  type_group?: string;
  q?: string;
  page?: number;
  page_size?: number;
}) => get<Paged<HospitalRow>>("/distribution/hospitals", p);
