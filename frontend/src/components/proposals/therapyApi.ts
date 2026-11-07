const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

/** 제안서 치료장비 품목 (관리 화면용) */
export interface TherapyItem {
  id: number;
  name: string;
  maker: string | null;
  model: string | null;
  note: string | null;
  warranty: string | null;
  image_key: string | null;
  /** /api/... 로 시작하는 경로. 화면에 띄울 땐 therapyImageSrc()로 API 주소를 붙인다. */
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface TherapyItemPayload {
  name: string;
  maker: string;
  model: string;
  note: string;
  warranty: string;
  is_active: boolean;
}

export function therapyImageSrc(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${API}${url}`;
}

// 서버 오류는 {detail: string | string[]}. 검증 오류(422)는 {detail: [{msg}]}일 수도 있다.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    let msg = `요청에 실패했습니다 (${res.status})`;
    try {
      const body = await res.json();
      const d = body?.detail;
      if (typeof d === "string") msg = d;
      else if (Array.isArray(d))
        msg = d.map((x: unknown) => (typeof x === "string" ? x : (x as { msg?: string })?.msg ?? "")).filter(Boolean).join(", ") || msg;
    } catch {
      // 본문이 JSON이 아니면 기본 문구
    }
    throw new Error(msg);
  }
  return res.json();
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function fetchTherapyItems(): Promise<TherapyItem[]> {
  return request("/api/proposals/therapy-items?include_inactive=true");
}

export function createTherapyItem(p: TherapyItemPayload): Promise<TherapyItem> {
  return request("/api/proposals/therapy-items", jsonInit("POST", p));
}

export function updateTherapyItem(id: number, p: TherapyItemPayload): Promise<TherapyItem> {
  return request(`/api/proposals/therapy-items/${id}`, jsonInit("PUT", p));
}

export function reorderTherapyItems(ids: number[]): Promise<{ ok: boolean }> {
  return request("/api/proposals/therapy-items/reorder", jsonInit("POST", { ids }));
}

export function uploadTherapyImage(id: number, file: File): Promise<TherapyItem> {
  const fd = new FormData();
  fd.append("file", file);
  return request(`/api/proposals/therapy-items/${id}/image`, { method: "POST", body: fd });
}
