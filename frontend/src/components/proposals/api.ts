import type { Catalog, ProposalDetail, ProposalForm, ProposalListItem } from "./types";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

/** 서버 오류(detail: 문자열 | 문자열 배열 | Pydantic 오류 목록)를 사람이 읽을 한 줄로 */
async function errorText(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x) => (typeof x === "string" ? x : x?.msg ? `${(x.loc || []).slice(-2).join(".")} ${x.msg}` : ""))
      .filter(Boolean)
      .join(" / ");
  }
  return fallback;
}

async function call<T>(path: string, init: RequestInit = {}, fallback = "요청을 처리하지 못했습니다"): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error(await errorText(res, fallback));
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const fetchProposals = (q = "") =>
  call<ProposalListItem[]>(`/api/proposals${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const fetchProposal = (id: number) => call<ProposalDetail>(`/api/proposals/${id}`);
export const fetchCatalog = () => call<Catalog>("/api/proposals/catalog");
export const createProposal = (f: ProposalForm) => call<ProposalDetail>("/api/proposals", json("POST", f), "저장하지 못했습니다");
export const updateProposal = (id: number, f: ProposalForm) =>
  call<ProposalDetail>(`/api/proposals/${id}`, json("PUT", f), "저장하지 못했습니다");
export const deleteProposal = (id: number) => call<{ ok: boolean }>(`/api/proposals/${id}`, { method: "DELETE" }, "삭제하지 못했습니다");
export const copyProposal = (id: number) => call<ProposalDetail>(`/api/proposals/${id}/copy`, { method: "POST" }, "복사하지 못했습니다");

/** 미리보기 HTML. 사진 주소가 '/api/…' 상대 경로라 iframe에서 API 서버를 가리키도록 <base>를 붙인다. */
export async function fetchPreview(f: ProposalForm): Promise<string> {
  const res = await fetch(`${API}/api/proposals/preview`, { credentials: "include", ...json("POST", f) });
  if (!res.ok) throw new Error(await errorText(res, "미리보기를 만들지 못했습니다"));
  const html = await res.text();
  return html.replace("<head>", `<head><base href="${API}/">`);
}

/** PDF 다운로드 — 서버가 정한 한글 파일명 그대로 저장 */
export async function downloadPdf(id: number): Promise<void> {
  const res = await fetch(`${API}/api/proposals/${id}/pdf`, { credentials: "include" });
  if (!res.ok) throw new Error(await errorText(res, "PDF를 만들지 못했습니다"));
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const name = m ? decodeURIComponent(m[1]) : `제안서_${id}.pdf`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
