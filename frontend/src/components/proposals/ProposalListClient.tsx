"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { copyProposal, deleteProposal, downloadPdf, fetchProposals } from "./api";
import type { ProposalListItem } from "./types";

const DESIGN_LABEL = { A: "A 블루", C: "C 그린" } as const;

export default function ProposalListClient() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<ProposalListItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // 검색어 입력이 멈추면 다시 불러온다
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      fetchProposals(q)
        .then(setRows)
        .catch((e: Error) => setMsg(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function run(id: number, fn: () => Promise<void>) {
    setBusyId(id);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const canDelete = (r: ProposalListItem) => !!user && (user.id === r.author_id || user.is_admin);

  const actions = (r: ProposalListItem) =>
    confirmId === r.id ? (
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-ui-xs text-error-600">삭제할까요?</span>
        <button
          className="btn btn-danger h-7 px-2 text-ui-xs"
          onClick={() =>
            run(r.id, async () => {
              await deleteProposal(r.id);
              setRows((rs) => rs.filter((x) => x.id !== r.id));
              setConfirmId(null);
            })
          }
        >
          삭제
        </button>
        <button className="btn btn-ghost h-7 px-2 text-ui-xs" onClick={() => setConfirmId(null)}>
          취소
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-ghost h-7 px-2 text-ui-xs"
          disabled={busyId === r.id}
          onClick={() => run(r.id, () => downloadPdf(r.id))}
        >
          {busyId === r.id ? "…" : "PDF"}
        </button>
        <button
          className="btn btn-ghost h-7 px-2 text-ui-xs"
          disabled={busyId === r.id}
          onClick={() =>
            run(r.id, async () => {
              const c = await copyProposal(r.id);
              router.push(`/proposals/${c.id}`);
            })
          }
        >
          복사
        </button>
        {canDelete(r) && (
          <button className="btn btn-ghost h-7 px-2 text-ui-xs text-error-600" onClick={() => setConfirmId(r.id)}>
            삭제
          </button>
        )}
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
        <input className="field min-w-0 flex-1" placeholder="병원명·받는 분 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => router.push("/proposals/new")}>
          새 제안서
        </button>
      </div>
      {msg && <div className="surface-card px-3 py-2 text-ui text-error-600">{msg}</div>}

      {loading && rows.length === 0 ? (
        <div className="surface-card fg-muted p-6 text-ui">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="surface-card fg-muted p-8 text-center text-ui">
          {q ? "검색 결과가 없습니다." : "아직 만든 제안서가 없습니다. [새 제안서]로 시작하세요."}
        </div>
      ) : (
        <>
          {/* PC: 표 */}
          <div className="surface-card hidden overflow-x-auto sm:block">
            <table className="table-dense w-full">
              <thead>
                <tr>
                  <th className="th-dense">병원명</th>
                  <th className="th-dense">받는 분</th>
                  <th className="th-dense">제안일</th>
                  <th className="th-dense">장비</th>
                  <th className="th-dense">담당자</th>
                  <th className="th-dense">디자인</th>
                  <th className="th-dense">작성자</th>
                  <th className="th-dense"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="row-hover cursor-pointer" onClick={() => router.push(`/proposals/${r.id}`)}>
                    <td className="td-dense fg-strong font-medium">{r.hospital_name}</td>
                    <td className="td-dense">{r.doctor_name}</td>
                    <td className="td-dense tabular-nums">{r.proposal_date}</td>
                    <td className="td-dense fg-muted">{r.summary || "-"}</td>
                    <td className="td-dense">{r.rep_name || "-"}</td>
                    <td className="td-dense">
                      <span className="chip">{DESIGN_LABEL[r.design]}</span>
                    </td>
                    <td className="td-dense fg-muted">{r.author_name}</td>
                    <td className="td-dense text-right">{actions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 폰: 카드 */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <li key={r.id} className="surface-card p-3" onClick={() => router.push(`/proposals/${r.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="fg-strong text-ui-md font-semibold">{r.hospital_name}</div>
                    <div className="fg-muted text-ui-xs">
                      {r.doctor_name} · {r.proposal_date} · {DESIGN_LABEL[r.design]}
                    </div>
                    {r.summary && <div className="fg-base mt-1 text-ui-xs">{r.summary}</div>}
                  </div>
                </div>
                <div className="mt-2 flex justify-end">{actions(r)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
