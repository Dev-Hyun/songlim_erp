"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/common/RichTextEditor";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
const STATUSES = ["접수", "처리중", "처리완료"];

interface Ticket {
  id: number;
  title: string;
  content: string;
  status: string;
  created_by: number;
  created_by_name: string;
  hospital_name: string | null;
  is_mine: boolean;
  created_at: string;
}

interface Comment {
  id: number;
  content: string;
  created_by: number;
  created_at: string;
}

export default function CsDetailClient({ id }: { id: number }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentEditorKey, setCommentEditorKey] = useState(0);
  const { user } = useAuth();
  const router = useRouter();
  const isStaff = user?.role === "songrim";

  function load() {
    fetch(`${API}/api/cs/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setTicket(d.ticket);
        setComments(d.comments);
      });
  }

  useEffect(load, [id]);

  function isCommentEmpty(html: string) {
    return !html.replace(/<[^>]*>/g, "").trim() && !html.includes("<img");
  }

  async function submitComment() {
    if (isCommentEmpty(commentText)) return;
    await fetch(`${API}/api/cs/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: commentText }),
    });
    setCommentText("");
    setCommentEditorKey((k) => k + 1);
    load();
  }

  async function changeStatus(status: string) {
    await fetch(`${API}/api/cs/${id}/status?status=${encodeURIComponent(status)}`, {
      method: "PATCH",
      credentials: "include",
    });
    load();
  }

  async function deleteTicket() {
    if (!confirm("이 CS 문의를 삭제하시겠습니까?")) return;
    await fetch(`${API}/api/cs/${id}`, { method: "DELETE", credentials: "include" });
    router.push("/cs");
  }

  if (!ticket) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/cs")} className="text-xs font-semibold text-gray-500 hover:text-brand-500">
          ← 목록으로
        </button>
        {(ticket.is_mine || user?.is_admin) && (
          <button onClick={deleteTicket} className="text-xs font-semibold text-error-500 hover:underline">
            삭제
          </button>
        )}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white/90">{ticket.title}</h2>
          {isStaff ? (
            <select
              value={ticket.status}
              onChange={(e) => changeStatus(e.target.value)}
              className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
              {ticket.status}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {ticket.hospital_name || ticket.created_by_name} · {ticket.created_at?.slice(0, 16).replace("T", " ")}
        </div>
        <div
          className="prose prose-sm dark:prose-invert mt-4 max-w-none text-sm text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: ticket.content || "" }}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-2 text-xs font-bold uppercase text-gray-400">💬 답변/댓글 {comments.length}</div>
        <div className="mb-3 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-gray-50 p-2.5 text-sm dark:bg-white/[0.02]">
              <div className="mb-1 text-[11px] text-gray-400">{c.created_at?.slice(0, 16).replace("T", " ")}</div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: c.content || "" }}
              />
            </div>
          ))}
          {comments.length === 0 && <div className="text-xs text-gray-400">아직 답변이 없습니다</div>}
        </div>
        {isStaff ? (
          <div className="space-y-2">
            <RichTextEditor key={commentEditorKey} value={commentText} onChange={setCommentText} placeholder="답변을 입력하세요" minHeight="80px" />
            <button onClick={submitComment} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-bold text-white">등록</button>
          </div>
        ) : (
          <div className="text-center text-xs text-gray-400">답변은 송림 담당자가 등록합니다</div>
        )}
      </div>
    </div>
  );
}
