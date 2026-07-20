import type { ContractDetail, ContractItemRow, ContractListItem, ContractStatus } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export async function fetchContracts(): Promise<ContractListItem[]> {
  const res = await fetch(`${API}/api/contracts`, { credentials: "include" });
  return res.json();
}

export interface ContractCreatePayload {
  buyer_hospital?: string;
  buyer_biz_no?: string;
  buyer_rep?: string;
  contract_date?: string;
  buyer_address?: string;
  buyer_phone?: string;
  buyer_mobile?: string;
  buyer_fax?: string;
  install_date?: string;
  sale_amount?: number;
  sale_amount_note?: string;
  etc_note?: string;
  customer_request?: string;
  items?: { name: string; qty?: string; note?: string }[];
}

export async function createContract(payload: ContractCreatePayload): Promise<{ id: number }> {
  const res = await fetch(`${API}/api/contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("계약 생성 실패");
  return res.json();
}

export async function fetchContractDetail(id: number): Promise<ContractDetail> {
  const res = await fetch(`${API}/api/contracts/${id}`, { credentials: "include" });
  return res.json();
}

export async function updateContract(
  id: number,
  payload: Partial<{
    status: ContractStatus;
    contract_date: string;
    buyer_hospital: string;
    buyer_biz_no: string;
    buyer_rep: string;
    buyer_address: string;
    buyer_phone: string;
    buyer_mobile: string;
    buyer_fax: string;
    sale_amount: number;
    sale_amount_note: string;
    etc_note: string;
    customer_request: string;
    install_date: string;
    items: { name: string; qty?: string; note?: string }[];
  }>
) {
  const res = await fetch(`${API}/api/contracts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("계약 수정 실패");
  return res.json();
}

export async function deleteContract(id: number) {
  await fetch(`${API}/api/contracts/${id}`, { method: "DELETE", credentials: "include" });
}

export async function addComment(id: number, body: string) {
  const res = await fetch(`${API}/api/contracts/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ body }),
  });
  return res.json();
}

export async function deleteComment(id: number, commentId: number) {
  await fetch(`${API}/api/contracts/${id}/comments/${commentId}`, { method: "DELETE", credentials: "include" });
}

export async function uploadPhoto(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/contracts/${id}/photos`, { method: "POST", credentials: "include", body: form });
  return res.json();
}

export function photoUrl(contractId: number, photoId: number) {
  return `${API}/api/contracts/${contractId}/photos/${photoId}/image`;
}

export async function deletePhoto(id: number, photoId: number) {
  await fetch(`${API}/api/contracts/${id}/photos/${photoId}`, { method: "DELETE", credentials: "include" });
}

export type { ContractItemRow };
