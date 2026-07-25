import type { EquipmentCategory } from "../sales-map/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface StatsFilter {
  category: EquipmentCategory;
  year: number;
  sido?: string;
  sigungu?: string;
  typeGroup?: string;
}

function qs(f: StatsFilter, extra?: Record<string, string>) {
  const p = new URLSearchParams({ category: f.category, year: String(f.year) });
  if (f.sido) p.set("sido", f.sido);
  if (f.sigungu) p.set("sigungu", f.sigungu);
  if (f.typeGroup) p.set("type_group", f.typeGroup);
  if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}

export interface SummaryStats {
  total_equipment: number;
  hospitals_with_equipment: number;
  maker_count: number;
  model_count: number;
  no_equipment_count: number;
}

export async function fetchSummary(f: StatsFilter): Promise<SummaryStats> {
  const res = await fetch(`${API}/api/stats/summary?${qs(f)}`, { credentials: "include" });
  if (!res.ok) throw new Error("통계 요약 조회 실패");
  return res.json();
}

export interface ShareItem {
  label: string;
  count: number;
  share: number;
}

export type StatsGroupBy = "maker" | "model" | "series";

export async function fetchMarketShare(f: StatsFilter, by: StatsGroupBy): Promise<ShareItem[]> {
  const res = await fetch(`${API}/api/stats/market-share?${qs(f, { by })}`, { credentials: "include" });
  if (!res.ok) throw new Error("점유율 조회 실패");
  return res.json();
}

export interface TrendData {
  years: number[];
  labels: string[];
  data: Record<string, number[]>;
}

export async function fetchYearlyTrend(f: StatsFilter, by: StatsGroupBy): Promise<TrendData> {
  const res = await fetch(`${API}/api/stats/yearly-trend?${qs(f, { by, top_n: "8" })}`, { credentials: "include" });
  if (!res.ok) throw new Error("연도별 추이 조회 실패");
  return res.json();
}

export async function fetchByRegion(category: EquipmentCategory, year: number): Promise<{ sido: string; count: number }[]> {
  const p = new URLSearchParams({ category, year: String(year) });
  const res = await fetch(`${API}/api/stats/by-region?${p.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("시도별 분포 조회 실패");
  return res.json();
}

export async function fetchByType(category: EquipmentCategory, year: number): Promise<{ type: string; count: number }[]> {
  const p = new URLSearchParams({ category, year: String(year) });
  const res = await fetch(`${API}/api/stats/by-type?${p.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("병원 종별 분포 조회 실패");
  return res.json();
}

export async function fetchSigunguList(sido: string): Promise<string[]> {
  const res = await fetch(`${API}/api/regions/sigungu?sido=${encodeURIComponent(sido)}`, { credentials: "include" });
  if (!res.ok) throw new Error("시군구 목록 조회 실패");
  return res.json();
}
