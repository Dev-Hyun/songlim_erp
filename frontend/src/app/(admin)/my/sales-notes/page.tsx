"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAllSalesNotes,
  fetchPersonalMemos,
  createPersonalMemo,
  updatePersonalMemo,
  deletePersonalMemo,
} from "@/components/sales-map/api";
import { SalesNoteItem, PersonalMemoItem } from "@/components/sales-map/types";
import StaffOnly from "@/components/auth/StaffOnly";

type Tab = "notes" | "memo";

// 영업노트를 날짜별로 묶어서 보여준다. 날짜 그룹의 순서는 정렬 방향(최신순/오래된순)을 그대로
// 따르고, 같은 날짜 안에서는 항상 작성 순서(created_at 오름차순)로 모아 보여준다.
function groupNotesByDate(notes: SalesNoteItem[], sort: "desc" | "asc"): [string, SalesNoteItem[]][] {
  const buckets = new Map<string, SalesNoteItem[]>();
  for (const n of notes) {
    const key = n.visit_date || n.created_at?.slice(0, 10) || "날짜 없음";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(n);
  }
  for (const group of buckets.values()) {
    group.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  }
  const entries = Array.from(buckets.entries());
  entries.sort((a, b) => (sort === "asc" ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])));
  return entries;
}

export default function MySalesNotesPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("notes");

  const [notes, setNotes] = useState<SalesNoteItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");

  const [memos, setMemos] = useState<PersonalMemoItem[]>([]);
  const [memosLoading, setMemosLoading] = useState(true);
  const [newMemo, setNewMemo] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

  function loadNotes() {
    if (!user) return;
    setNotesLoading(true);
    fetchAllSalesNotes({ q: search || undefined, sort }).then(setNotes).finally(() => setNotesLoading(false));
  }

  function loadMemos() {
    if (!user) return;
    setMemosLoading(true);
    fetchPersonalMemos().then(setMemos).finally(() => setMemosLoading(false));
  }

  useEffect(() => {
    if (!user) {
      setNotesLoading(false);
      setMemosLoading(false);
      return;
    }
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sort]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(loadNotes, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (tab === "memo" && user) loadMemos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  async function handleAddMemo() {
    if (!newMemo.trim()) return;
    await createPersonalMemo(newMemo.trim());
    setNewMemo("");
    loadMemos();
  }

  function startEdit(m: PersonalMemoItem) {
    setEditingId(m.id);
    setEditingContent(m.content);
  }

  async function saveEdit() {
    if (editingId == null) return;
    await updatePersonalMemo(editingId, editingContent);
    setEditingId(null);
    setEditingContent("");
    loadMemos();
  }

  async function handleDeleteMemo(id: number) {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    await deletePersonalMemo(id);
    loadMemos();
  }

  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="영업노트" />

        <div className="mb-4 flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04] w-fit">
          <button
            onClick={() => setTab("notes")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${tab === "notes" ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            영업노트
          </button>
          <button
            onClick={() => setTab("memo")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${tab === "memo" ? "bg-brand-500 text-white" : "text-gray-500"}`}
          >
            메모
          </button>
        </div>

        {authLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : !user ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
            로그인이 필요합니다
          </div>
        ) : tab === "notes" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="병원명/내용 검색..."
                className="w-56 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
              <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
                <button
                  onClick={() => setSort("desc")}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${sort === "desc" ? "bg-brand-500 text-white" : "text-gray-500"}`}
                >
                  최신순
                </button>
                <button
                  onClick={() => setSort("asc")}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${sort === "asc" ? "bg-brand-500 text-white" : "text-gray-500"}`}
                >
                  오래된순
                </button>
              </div>
              <span className="ml-auto text-xs text-gray-400">전 직원 영업노트 공유</span>
            </div>

            {notesLoading ? (
              <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
            ) : notes.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
                작성된 영업노트가 없습니다. 영업지도에서 병원을 선택해 작성해보세요.
              </div>
            ) : (
              <div className="space-y-5">
                {groupNotesByDate(notes, sort).map(([date, group]) => (
                  <div key={date}>
                    <div className="mb-2 text-xs font-bold text-gray-400">{date}</div>
                    <div className="space-y-2">
                      {group.map((n) => (
                        <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{n.hospital_name}</span>
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-white/10 dark:text-gray-300">
                                {n.author_name || "-"}
                              </span>
                            </div>
                            <span className="shrink-0 text-xs text-gray-400">{n.created_at?.slice(11, 16)}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{n.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <textarea
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
                placeholder="메모 내용 (본인만 볼 수 있습니다)"
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <div className="mt-2 flex justify-end">
                <button onClick={handleAddMemo} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white">
                  메모 추가
                </button>
              </div>
            </div>

            {memosLoading ? (
              <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
            ) : memos.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
                작성한 메모가 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {memos.map((m) => (
                  <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    {editingId === m.id ? (
                      <div>
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">
                            취소
                          </button>
                          <button onClick={saveEdit} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-gray-400">{m.created_at?.slice(0, 19).replace("T", " ")}</span>
                          <div className="flex gap-2">
                            <button onClick={() => startEdit(m)} className="text-xs font-semibold text-gray-500 hover:underline dark:text-gray-400">
                              수정
                            </button>
                            <button onClick={() => handleDeleteMemo(m.id)} className="text-xs font-semibold text-error-500 hover:underline">
                              삭제
                            </button>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{m.content}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </StaffOnly>
  );
}
