export type EquipmentCategory = "us" | "xray" | "ct" | "mri" | "bmd" | "carm";

// 보유 기간(교체 시기) — 같은 모델을 최신 연도부터 몇 해 연속 등록했나 (backend app/tenure.py)
export interface EquipmentTenure {
  tenure_years: number | null;
  since_year: number | null;
  tenure_capped: boolean | null; // 첫 데이터 연도부터 이어짐 → 실제로는 더 길 수 있어 "N년 이상"
}

export interface HospitalListItem extends EquipmentTenure {
  id: number;
  name: string;
  type: string | null;
  sido: string | null;
  sigungu: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  dist_km: number | null;
  is_member: boolean;
  has_equipment: boolean;
  current_maker: string | null;
  current_model: string | null;
  tenure_model: string | null; // 보유 기간을 잰 모델 — 지금 보유 중인 모델 중 가장 오래 연속 등록된 것
}

export interface YearlyEquipment {
  year: number;
  total: number;
  // 보유 기간은 분류 최신 연도 행에만 값이 있고 다른 연도·수동 등록 행은 null
  models: ({ id: number; manufacturer: string | null; model: string | null; eq_count: number; source: string } & EquipmentTenure & EquipmentLicenseRef)[];
}

// 상세 화면 장비 행의 표시용 제조사(brand)와 식약처 허가번호 — 레거시 6분류는 허가번호가 없다(null)
export interface EquipmentLicenseRef {
  maker?: string | null;
  license_no?: string | null;
}

// 식약처 품목허가 요약 (backend sales_map._license_info)
export interface LicenseInfo {
  item_name: string | null;
  origin: "국산" | "수입" | null; // 허가번호 머리글자(제/수), 없으면 업종(제조업/수입업)
  makers: string[]; // 제조원 — 국내 제조 허가는 비어 있는 경우가 많다
  client: string | null; // 제조 의뢰자
  nation: string | null; // 제조국
  permit_date: string | null;
  revoked: boolean; // 그 허가번호의 품목이 모두 취소·취하
  revoked_date: string | null;
}

// 영업지도 필터 "보유 N년 이상" 선택지
export const TENURE_OPTIONS = [3, 5, 7];
/** 같은 모델을 이 햇수 이상 연속 보유하면 '교체 시기'로 본다 — 목록 점 색과 상세 배지가 같은 기준을 쓴다 */
export const REPLACE_SOON_YEARS = 7;

export function tenureLabel(t: EquipmentTenure): string | null {
  if (!t.tenure_years) return null;
  return t.tenure_capped ? `${t.tenure_years}년 이상` : `${t.tenure_years}년째`;
}

export interface HospitalDetail {
  hospital: {
    id: number;
    name: string;
    type: string | null;
    sido: string | null;
    sigungu: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    is_member: boolean;
    estb_date?: string | null; // 개설일자 YYYY-MM-DD
  };
  yearly_by_category: Record<string, YearlyEquipment[]>;
  category_names?: Record<string, string>; // 분류 코드 → 심평원 한글명 (레거시 6분류 외)
  licenses?: Record<string, LicenseInfo>;
}

export interface SalesNoteItem {
  id: number;
  hospital_id: number;
  hospital_name?: string;
  user_id: number;
  author_name?: string;
  visit_date: string | null;
  content: string;
  created_at: string;
}

export interface PersonalMemoItem {
  id: number;
  content: string;
  created_at: string;
}

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  us: "초음파",
  xray: "엑스레이",
  ct: "CT",
  mri: "MRI",
  bmd: "BMD",
  carm: "C-Arm",
};
