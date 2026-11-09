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

export type ExportFormat = "pdf" | "pptx";

/** PDF/PPT 다운로드 — 서버가 파일을 만들어 두고 준 주소로 이동해 브라우저가 일반 파일처럼 받게 한다.
 *  (blob으로 받으면 안드로이드 앱 안 브라우저·다운로드 관리자에서 "지원하지 않는 파일 형식"이 됐다) */
export async function downloadFile(id: number, fmt: ExportFormat): Promise<void> {
  const label = fmt === "pdf" ? "PDF" : "PPT";
  const res = await fetch(`${API}/api/proposals/${id}/export?fmt=${fmt}`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error(await errorText(res, `${label}를 만들지 못했습니다`));
  const { url } = (await res.json()) as { url: string };
  const a = document.createElement("a");
  a.href = `${API}${url}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
