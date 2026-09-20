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

/* ────────────────────────────────────────────────────────
 * 의료기관 개설 현황 — /api/med/openings/*
 * 행정안전부 지방행정 인허가(개설·등록) 데이터(localdata_clinics) 기반.
 * 모든 기간 창은 서버가 데이터 기준일(as_of)에 맞춰 잡는다 — 브라우저의 "오늘"을 쓰지 않는다.
 * ──────────────────────────────────────────────────────── */

/** 조회 기간 프리셋(일). 0 = 전체. 서버 med_stats.OPENING_PERIODS와 값이 같아야 한다. */
export type OpeningDays = 7 | 30 | 90 | 365 | 1095 | 1825 | 0;

/** 상태 필터 4종 — '전체' 옵션은 없다. */
export type OpeningStatus = "영업/정상" | "휴업" | "폐업" | "취소/말소/정지";

export type OpeningsMeta = {
  as_of: string;
  data_updated_at: string;
  source: string;
  /** hospitals 탭은 활용신청 승인 전이라 available=false로 내려온다. */
  categories: { value: string; label: string; available: boolean }[];
  periods: { value: number; label: string }[];
  statuses: { value: OpeningStatus; date_label: string }[];
  sidos: { value: string; sigungus: string[] }[];
};

/** 아직 적재되지 않은 탭(신규 병원)의 공통 응답. */
export type OpeningsPending = {
  available: false;
  category: string;
  as_of: string;
  data_updated_at: string;
  message: string;
};

type OpeningsBase = { available: true; category: string; as_of: string; data_updated_at: string };

export type OpeningsSummaryData = OpeningsBase & {
  recent30: { start: string | null; end: string; count: number };
  recent90: { start: string | null; end: string; count: number };
  prev30: { start: string; end: string; count: number };
  /** 최근 90일 ÷ 90 × 30 — 최근 30일과 비교하는 기준선. */
  baseline30: number;
  gap_vs_baseline: number;
  delta_vs_prev30: number;
  metro: { count: number; share: number; non_count: number; non_share: number };
  top_region: { sido: string; sigungu: string; recent: number; prev: number; delta: number } | null;
  last12m: { closed: number; revoked: number; suspended: number };
  insights: string[];
  metro_summary: string;
};

export type OpeningsTrendPoint = {
  month: string;
  opened: number;
  closed: number;
  revoked: number;
  suspended: number;
  /** 이번 달은 기준일까지의 진행 중 집계다. */
  partial: boolean;
};

export type OpeningsTrendData = OpeningsBase & {
  current_month: string;
  avg_recent3: number;
  points: OpeningsTrendPoint[];
};

export type OpeningsDeptRow = {
  dept: string;
  metro: number;
  non_metro: number;
  metro_share: number;
  non_metro_share: number;
  /** 수도권 비중 − 비수도권 비중 (%p). */
  diff: number;
};

export type OpeningsDeptMixData = OpeningsBase & {
  days: number;
  start: string | null;
  end: string;
  metro_total: number;
  non_metro_total: number;
  rows: OpeningsDeptRow[];
  summary: string;
};

export type OpeningsHeatmapData = OpeningsBase & {
  days: number;
  start: string | null;
  end: string;
  sidos: string[];
  depts: string[];
  /** cells[행=시도][열=진료과] */
  cells: number[][];
  max: number;
  top_cells: { row: number; col: number; value: number }[];
  summary: string;
};

export type OpeningItem = {
  id: number;
  name: string;
  /** 도로명주소. 없는 옛 기관은 서버가 지번주소로 대체해 내려준다. */
  address: string | null;
  opened_date: string | null;
  status: OpeningStatus;
  detail_status: string | null;
  /** 조회 상태의 기준 날짜 (개설일 / 휴업 시작일 / 폐업일). */
  status_date: string | null;
  sido: string | null;
  sigungu: string | null;
  biz_type: string | null;
  dept: string | null;
};

export type OpeningsListData = OpeningsBase & {
  days: number;
  start: string | null;
  end: string;
  status: OpeningStatus;
  date_label: string;
  total: number;
  page: number;
  page_size: number;
  items: OpeningItem[];
};

export type OpeningsListPending = OpeningsPending & {
  total: number;
  page: number;
  page_size: number;
  items: OpeningItem[];
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

export type OpeningsListFilter = {
  category: string;
  days: number;
  sido?: string;
  sigungu?: string;
  status: OpeningStatus;
  q?: string;
  page?: number;
  page_size?: number;
};

export const fetchOpeningsMeta = () => get<OpeningsMeta>("/openings/meta");

export const fetchOpeningsSummary = (p: { category: string }) =>
  get<OpeningsSummaryData | OpeningsPending>("/openings/summary", p);

export const fetchOpeningsTrend = (p: { category: string }) =>
  get<OpeningsTrendData | OpeningsPending>("/openings/trend", p);

export const fetchOpeningsDeptMix = (p: { category: string; days: number }) =>
  get<OpeningsDeptMixData | OpeningsPending>("/openings/dept-mix", p);

export const fetchOpeningsHeatmap = (p: { category: string; days: number }) =>
  get<OpeningsHeatmapData | OpeningsPending>("/openings/heatmap", p);

export const fetchOpeningsList = (p: OpeningsListFilter) =>
  get<OpeningsListData | OpeningsListPending>("/openings/new-list", p);

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

/* ────────────────────────────────────────────────────────
 * 장비 카탈로그 (클릭 탐색) — /api/med/catalog/*
 * 텍스트 입력 없이 분류 → 모델 → 보유 의료기관으로 링크만 눌러 내려간다.
 * ──────────────────────────────────────────────────────── */

/** 분포 한 칸 — key는 종별명 또는 시도명. share는 이미 백분율(소수 1자리)이다. */
export type CatalogDist = { key: string; hospitals: number; units: number; share: number };
export type CatalogYear = { year: number; hospitals: number; units: number };
export type CatalogModelRow = { model: string; slug: string; hospitals: number; units: number; rank?: number };

export type CatalogCategoryRow = {
  category: string;
  code: string;
  name: string;
  hospitals: number;
  units: number;
  models: number;
};

export type CatalogCategories = {
  year: number;
  totals: { categories: number; hospitals: number; units: number; models: number };
  items: CatalogCategoryRow[];
};

export type CatalogCategoryDetail = {
  category: string;
  code: string;
  name: string;
  year: number;
  stats: { hospitals: number; units: number; models: number; top_type: CatalogDist | null };
  types: CatalogDist[];
  regions: CatalogDist[];
  years: CatalogYear[];
  /** false면 이 분류는 2025 스냅샷에만 있어서 연도 비교가 불가능하다. */
  multi_year: boolean;
  top_models: CatalogModelRow[];
  top_hospitals: {
    hospital_id: number;
    name: string;
    type: string | null;
    sido: string | null;
    sigungu: string | null;
    units: number;
  }[];
};

export type CatalogCategoryModels = {
  category: string;
  code: string;
  name: string;
  year: number;
  total: number;
  page: number;
  page_size: number;
  items: CatalogModelRow[];
};

export type CatalogModelDetail = {
  category: string;
  code: string;
  name: string;
  year: number;
  model: string;
  slug: string;
  stats: {
    hospitals: number;
    units: number;
    rank: number;
    models_in_category: number;
    share: number;
    top_type: CatalogDist | null;
  };
  types: CatalogDist[];
  regions: CatalogDist[];
  years: CatalogYear[];
  multi_year: boolean;
  manufacturers: { manufacturer: string; units: number }[];
  peers: CatalogModelRow[];
};

export type CatalogModelHospital = {
  hospital_id: number;
  name: string;
  type: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  is_member: boolean;
  units: number;
};

export type CatalogManufacturerRow = {
  manufacturer: string;
  models: number;
  hospitals: number;
  units: number;
  category_count: number;
  categories: { category: string; name: string; models: number; hospitals: number; units: number }[];
  /** manufacturer_confidence 컬럼이 생긴 뒤에만 채워진다 (확인/유력/미확인 건수). */
  confidence: Record<string, number> | null;
  rank: number;
};

export type CatalogManufacturers = {
  year: number;
  /** 제조사가 채워진 행이 한 건도 없으면 false — 화면은 안내만 보여준다. */
  available: boolean;
  has_confidence: boolean;
  sort: string;
  coverage: { filled_rows: number; total_rows: number; share: number };
  totals: { manufacturers: number; models: number; units: number };
  total: number;
  page: number;
  page_size: number;
  items: CatalogManufacturerRow[];
};

export type CatalogManufacturerSort = "units" | "models" | "hospitals" | "name";

/** 경로 세그먼트에 들어가는 분류 코드·모델 슬러그(한글 포함 가능)를 항상 인코딩한다. */
const seg = (v: string) => encodeURIComponent(v);

export const fetchCatalogCategories = () => get<CatalogCategories>("/catalog/categories");

export const fetchCatalogCategory = (code: string) =>
  get<CatalogCategoryDetail>(`/catalog/categories/${seg(code)}`);

export const fetchCatalogCategoryModels = (code: string, p: { page?: number; page_size?: number } = {}) =>
  get<CatalogCategoryModels>(`/catalog/categories/${seg(code)}/models`, p);

export const fetchCatalogModel = (code: string, slug: string) =>
  get<CatalogModelDetail>(`/catalog/categories/${seg(code)}/models/${seg(slug)}`);

export const fetchCatalogModelHospitals = (
  code: string,
  slug: string,
  p: { sido?: string; page?: number; page_size?: number } = {},
) => get<Paged<CatalogModelHospital>>(`/catalog/categories/${seg(code)}/models/${seg(slug)}/hospitals`, p);

export const fetchCatalogManufacturers = (p: {
  sort?: CatalogManufacturerSort;
  page?: number;
  page_size?: number;
}) => get<CatalogManufacturers>("/catalog/manufacturers", p);

/* ────────────────────────────────────────────────────────
 * 모델 탐색 / 의료기관 상세 — /api/med/catalog/models · /catalog/hospitals
 * 슬러그는 분류 단위로 만들어지므로, 분류를 거치지 않고 들어올 때는 모델명 슬러그(name_slug)로
 * 먼저 분류를 고른 뒤 분류별 슬러그(slug)로 상세에 들어간다.
 * ──────────────────────────────────────────────────────── */

export type CatalogModelIndexRow = {
  model: string;
  /** 분류 안에서만 유일한 슬러그 — 모델 상세 경로에 쓴다. */
  slug: string;
  /** 모델명만 정규화한 슬러그 — 동음이의 선택 경로에 쓴다. */
  name_slug: string;
  category: string;
  code: string;
  name: string;
  hospitals: number;
  units: number;
  /** 같은 모델명이 2개 이상 장비 분류에 있다 → 분류를 먼저 골라야 한다. */
  homonym: boolean;
  /** 같은 모델명 슬러그로 묶이는 항목 수(분류 차이 + 대소문자·공백 표기 차이). */
  variants: number;
};

export type CatalogModelIndex = {
  year: number;
  limit: number;
  /** pairs = 분류×모델 조합 수, names = 모델명 슬러그 수, homonyms = 여러 분류에 걸친 모델명 수. */
  totals: { pairs: number; names: number; homonyms: number };
  items: CatalogModelIndexRow[];
};

export type CatalogModelAliasOption = {
  model: string;
  slug: string;
  category: string;
  code: string;
  name: string;
  hospitals: number;
  units: number;
};

export type CatalogModelAliases = {
  year: number;
  name_slug: string;
  names: string[];
  /** 1이면 동음이의가 아니라 같은 분류 안의 표기 변형이다. */
  categories: number;
  options: CatalogModelAliasOption[];
};

export type CatalogHospitalItem = {
  model: string | null;
  /** 최신 스냅샷에 없는 모델은 상세 페이지가 없어 null이다. */
  slug: string | null;
  manufacturer: string | null;
  /** 확인 / 유력 / 미확인 (2026-09-20에 '추정' 등급은 제거됨). */
  confidence: string | null;
  units: number;
  /** 직전 스냅샷에 그 분류가 없었으면 null (증감을 낼 수 없다). */
  delta: number | null;
};

export type CatalogHospitalGroup = {
  category: string;
  code: string;
  name: string;
  units: number;
  models: number;
  delta: number | null;
  items: CatalogHospitalItem[];
};

export type CatalogHospitalPeer = {
  hospital_id: number;
  name: string;
  categories: number;
  units: number;
  is_self: boolean;
};

export type CatalogHospitalDetail = {
  hospital: {
    id: number;
    ykiho: string | null;
    name: string;
    type: string | null;
    sido: string | null;
    sigungu: string | null;
    address: string | null;
    estb_date: string | null;
    is_member: boolean;
  };
  year: number;
  prev_year: number | null;
  years: { year: number; categories: number; units: number }[];
  stats: {
    categories: number;
    models: number;
    units: number;
    /** 직전 스냅샷에도 있던 분류만 더한 증감. */
    delta_units: number | null;
    /** 증감 계산에서 빠진 분류 수. */
    delta_skipped: number;
  };
  groups: CatalogHospitalGroup[];
  peers:
    | { available: false }
    | {
        available: true;
        sido: string;
        sigungu: string;
        type: string;
        total: number;
        rank: number | null;
        items: CatalogHospitalPeer[];
      };
};

export const fetchCatalogModelIndex = (p: { limit?: number } = {}) =>
  get<CatalogModelIndex>("/catalog/models", p);

export const fetchCatalogModelAliases = (nameSlug: string) =>
  get<CatalogModelAliases>(`/catalog/models/${seg(nameSlug)}`);

export const fetchCatalogHospital = (hospitalId: number, p: { year?: number } = {}) =>
  get<CatalogHospitalDetail>(`/catalog/hospitals/${hospitalId}`, p);
