export type EquipmentCategory = "us" | "xray" | "ct" | "mri" | "bmd" | "carm";

export interface HospitalListItem {
  id: number;
  name: string;
  type: string | null;
  sido: string | null;
  sigungu: string | null;
  lat: number | null;
  lng: number | null;
  dist_km: number | null;
  is_member: boolean;
  has_equipment: boolean;
  current_maker: string | null;
  current_model: string | null;
}

export interface YearlyEquipment {
  year: number;
  total: number;
  models: { id: number; manufacturer: string | null; model: string | null; eq_count: number; source: string }[];
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
  };
  yearly_by_category: Record<string, YearlyEquipment[]>;
}

export interface SalesNoteItem {
  id: number;
  hospital_id: number;
  hospital_name?: string;
  user_id: number;
  visit_date: string | null;
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
