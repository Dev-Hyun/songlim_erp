"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/common/RichTextEditor";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface Notice {
  id: number;
  title: string;
  content: string;
  notice_type: string;
  created_by: number;
  created_by_name: string;
  is_mine: boolean;
  created_at: string;
}

export default function NoticeDetailClient({ id }: { id: number }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const { user } = useAuth();
  const router = useRouter();

  function load() {
    fetch(`${API}/api/notices/${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setNotice)
      .catch(() => setNotFound(true));
  }

  useEffect(load, [id]);

  const listHref = notice?.notice_type === "internal" ? "/notices/internal" : "/notices/hospital";
  // 공지 수정/삭제는 송림 직원(작성자 본인 또는 관리자)만.
  const canEdit = !!notice && user?.role === "songrim" && (notice.is_mine || !!user?.is_admin);

  async function deleteNotice() {
    if (!confirm("이 공지를 삭제하시겠습니까?")) return;
    await fetch(`${API}/api/notices/${id}`, { method: "DELETE", credentials: "include" });
    router.push(listHref);
  }

  function startEdit() {
    if (!notice) return;
    setEditTitle(notice.title);
    setEditContent(notice.content);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editTitle.trim() || !notice) return;
    await fetch(`${API}/api/notices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: editTitle, content: editContent, notice_type: notice.notice_type }),
    });
    setEditing(false);
    load();
  }

  if (notFound) return <div className="empty-state">공지를 찾을 수 없습니다</div>;
  if (!notice) return <div className="empty-state">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push(listHref)} className="text-xs font-semibold text-gray-500 hover:text-brand-500">
          ← 목록으로
        </button>
        {canEdit && !editing && (
          <div className="flex gap-3">
            <button onClick={startEdit} className="text-xs font-semibold text-gray-500 hover:text-brand-500 hover:underline">
              수정
            </button>
            <button onClick={deleteNotice} className="text-ui-sm font-medium text-error-600 hover:underline dark:text-error-400">
              삭제
            </button>
          </div>
        )}
      </div>
      <div className="surface-card p-4">
        {editing ? (
          <div className="space-y-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="제목"
              className="field-auto w-full"
            />
            <RichTextEditor value={editContent} onChange={setEditContent} placeholder="내용" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="rounded-control border border-gray-300 px-4 py-1.5 text-ui font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">
                취소
              </button>
              <button onClick={saveEdit} className="rounded-control bg-brand-500 px-4 py-1.5 text-ui font-medium text-white">
                저장
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="card-title">{notice.title}</h2>
            <div className="mt-1 fg-subtle text-ui-sm">
              {notice.created_by_name} · {notice.created_at?.slice(0, 16).replace("T", " ")}
            </div>
            <div
              className="prose prose-sm dark:prose-invert mt-4 max-w-none text-ui text-gray-700 dark:text-gray-300"
              dangerouslySetInnerHTML={{ __html: notice.content || "" }}
            />
          </>
        )}
      </div>
    </div>
  );
}
