"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/common/RichTextEditor";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface BoardItem {
  id: number;
  title: string;
  content?: string;
  status?: string;
  category?: string;
  created_by_name?: string;
  created_at: string;
}

interface Props {
  endpoint: string; // e.g. "/api/notices"
  title: string;
  hasStatus?: boolean;
  statusOptions?: string[];
  onStatusChange?: (id: number, status: string) => Promise<void>;
  detailHrefBase?: string; // if set, rows link to `${detailHrefBase}/${id}` instead of expanding inline
  canWrite?: boolean; // false면 로그인 여부와 무관하게 "새 글 작성" 버튼을 숨김 (읽기 전용 게시판용)
  createExtra?: Record<string, string>; // 글 작성 시 body에 함께 실어보낼 값 (예: notice_type)
}

export default function SimpleBoard({ endpoint, title, hasStatus, statusOptions, onStatusChange, detailHrefBase, canWrite = true, createExtra }: Props) {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const { user } = useAuth();

  function load() {
    setLoading(true);
    fetch(`${API}${endpoint}`, { credentials: "include" })
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  function isContentEmpty(html: string) {
    return !html.replace(/<[^>]*>/g, "").trim() && !html.includes("<img");
  }

  async function submit() {
    if (!newTitle.trim() || isContentEmpty(newContent)) return;
    const createUrl = endpoint.split("?")[0];
    await fetch(`${API}${createUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: newTitle, content: newContent, ...createExtra }),
    });
    setNewTitle("");
    setNewContent("");
    setShowForm(false);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-base font-bold text-gray-800 dark:text-white/90">{title}</h2>
        {user && canWrite && (
          <button onClick={() => setShowForm((v) => !v)} className="rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
            + 새 글 작성
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="제목"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <RichTextEditor value={newContent} onChange={setNewContent} placeholder="내용" />
          <button onClick={submit} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white">
            등록
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">등록된 글이 없습니다</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              <button
                onClick={() => (detailHrefBase ? (window.location.href = `${detailHrefBase}/${item.id}`) : setExpanded(expanded === item.id ? null : item.id))}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-white/90">
                  {item.title}
                  {item.created_by_name && (
                    <span className="text-xs font-normal text-gray-400">{item.created_by_name}</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {hasStatus && item.status && (
                    onStatusChange ? (
                      <select
                        value={item.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          e.stopPropagation();
                          await onStatusChange(item.id, e.target.value);
                          load();
                        }}
                        className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                      >
                        {(statusOptions || []).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                        {item.status}
                      </span>
                    )
                  )}
                  <span className="text-xs text-gray-400">{item.created_at?.slice(0, 10)}</span>
                </div>
              </button>
              {!detailHrefBase && expanded === item.id && (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none px-4 pb-4 text-sm text-gray-600 dark:text-gray-300"
                  dangerouslySetInnerHTML={{ __html: item.content || "" }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
