export type Design = "A" | "C";

export interface XrayLine {
  model: string;
  detector_count: number;
  detector_type?: string | null;
  table?: string | null;
  price: number;
  tradein?: number | null;
  options: { key: string; price: number }[];
}
export interface ModelPrice {
  model: string;
  price: number;
  tradein?: number | null;
}
export interface UsBrandLine {
  brand: string;
  /** probes = Include "Main Body + N Probe"의 N */
  models: { model: string; price: number; probes: number }[];
}
export interface TherapyLine {
  item_id: number;
  unit_price: number;
  qty: number;
  snapshot?: Record<string, unknown> | null;
}

export interface ProposalItems {
  xray: XrayLine[];
  pacs: { price: number } | null;
  mammo: ModelPrice[];
  carm: ModelPrice[];
  carm_table: "HCK" | "01M" | null;
  carm_reducer: { price: number } | null;
  bmd: ModelPrice[];
  ultrasound: UsBrandLine[];
  emg: ModelPrice[];
  therapy: TherapyLine[];
}

export interface ProposalForm {
  hospital_name: string;
  doctor_name: string;
  proposal_date: string;
  rep_name: string;
  rep_title: string;
  rep_phone: string;
  design: Design;
  items: ProposalItems;
}

export interface ProposalListItem {
  id: number;
  hospital_name: string;
  doctor_name: string;
  proposal_date: string;
  rep_name: string;
  design: Design;
  author_id: number;
  author_name: string;
  summary: string;
  updated_at: string | null;
}

export interface ProposalDetail extends ProposalListItem, ProposalForm {}

export interface TherapyCatalogItem {
  id: number;
  name: string;
  maker: string | null;
  model: string | null;
  note: string | null;
  warranty: string | null;
  image_url: string | null;
}

export interface Catalog {
  xray: { model: string; type: "stand" | "ceiling"; desc_line: string }[];
  xray_detector_types: string[];
  xray_table_types: string[];
  xray_options: { key: string; label: string }[];
  mammo: { model: string; brand: string; sub: string }[];
  carm: { model: string; sub: string }[];
  carm_tables: { key: "HCK" | "01M"; label: string }[];
  bmd: { model: string; sub: string }[];
  ultrasound: { brand: string; models: string[] }[];
  emg: { model: string; brand: string; sub: string }[];
  therapy: TherapyCatalogItem[];
  /** 기본 금액: 기존 제안서 금액 → 이후로는 누가 만들든 마지막 저장 금액. 키는 xray:모델, us:브랜드:모델, therapy:품목id 등 */
  defaults: Record<string, { price: number; qty: number | null }>;
}

export const EMPTY_ITEMS: ProposalItems = {
  xray: [],
  pacs: null,
  mammo: [],
  carm: [],
  carm_table: null,
  carm_reducer: null,
  bmd: [],
  ultrasound: [],
  emg: [],
  therapy: [],
};
