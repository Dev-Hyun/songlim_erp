"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAllSalesNotes,
  updateSalesNote,
  deleteSalesNote,
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
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [editNoteDate, setEditNoteDate] = useState("");

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

  function startEditNote(n: SalesNoteItem) {
    setEditingNoteId(n.id);
    setEditNoteContent(n.content);
    setEditNoteDate(n.visit_date || "");
  }

  async function saveEditNote() {
    if (editingNoteId == null || !editNoteContent.trim()) return;
    await updateSalesNote(editingNoteId, { content: editNoteContent.trim(), visit_date: editNoteDate || null });
    setEditingNoteId(null);
    loadNotes();
  }

  async function handleDeleteNote(id: number) {
    if (!confirm("이 영업노트를 삭제하시겠습니까?")) return;
    await deleteSalesNote(id);
    loadNotes();
  }

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

        <div className="seg mb-4 w-fit">
          <button
            onClick={() => setTab("notes")}
            className={`seg-item ${tab === "notes" ? "seg-item-on" : ""}`}
          >
            영업노트
          </button>
          <button
            onClick={() => setTab("memo")}
            className={`seg-item ${tab === "memo" ? "seg-item-on" : ""}`}
          >
            메모
          </button>
        </div>

        {authLoading ? (
          <div className="empty-state">불러오는 중...</div>
        ) : !user ? (
          <div className="surface-card empty-state">
            로그인이 필요합니다
          </div>
        ) : tab === "notes" ? (
          <div className="space-y-3">
            <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="병원명/내용 검색..."
                className="field w-56"
              />
              <div className="seg">
                <button
                  onClick={() => setSort("desc")}
                  className={`seg-item ${sort === "desc" ? "seg-item-on" : ""}`}
                >
                  최신순
                </button>
                <button
                  onClick={() => setSort("asc")}
                  className={`seg-item ${sort === "asc" ? "seg-item-on" : ""}`}
                >
                  오래된순
                </button>
              </div>
              <span className="ml-auto fg-subtle text-ui-sm">전 직원 영업노트 공유</span>
            </div>

            {notesLoading ? (
              <div className="empty-state">불러오는 중...</div>
            ) : notes.length === 0 ? (
              <div className="surface-card empty-state">
                작성된 영업노트가 없습니다. 영업지도에서 병원을 선택해 작성해보세요.
              </div>
            ) : (
              <div className="space-y-5">
                {groupNotesByDate(notes, sort).map(([date, group]) => (
                  <div key={date}>
                    <div className="label-eyebrow mb-2 tabular-nums">{date}</div>
                    <div className="space-y-2">
                      {group.map((n) => (
                        <div key={n.id} className="surface-card p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="fg-strong text-ui font-medium">{n.hospital_name}</span>
                              <span className="chip-quiet">
                                {n.author_name || "-"}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {n.user_id === user.id && editingNoteId !== n.id && (
                                <>
                                  <button onClick={() => startEditNote(n)} className="fg-muted text-ui-sm font-medium hover:underline">
                                    수정
                                  </button>
                                  <button onClick={() => handleDeleteNote(n.id)} className="text-ui-sm font-medium text-error-600 hover:underline dark:text-error-400">
                                    삭제
                                  </button>
                                </>
                              )}
                              <span className="fg-subtle text-ui-sm">{n.created_at?.slice(11, 16)}</span>
                            </div>
                          </div>
                          {editingNoteId === n.id ? (
                            <div>
                              <input
                                type="date"
                                value={editNoteDate}
                                onChange={(e) => setEditNoteDate(e.target.value)}
                                className="field mb-2"
                              />
                              <textarea
                                value={editNoteContent}
                                onChange={(e) => setEditNoteContent(e.target.value)}
                                rows={3}
                                className="field-auto w-full"
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button onClick={() => setEditingNoteId(null)} className="btn btn-default">
                                  취소
                                </button>
                                <button onClick={saveEditNote} className="btn btn-primary">
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="fg-base whitespace-pre-wrap text-ui">{n.content}</div>
                          )}
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
            <div className="surface-card p-3">
              <textarea
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
                placeholder="메모 내용 (본인만 볼 수 있습니다)"
                rows={3}
                className="field-auto w-full"
              />
              <div className="mt-2 flex justify-end">
                <button onClick={handleAddMemo} className="btn btn-primary">
                  메모 추가
                </button>
              </div>
            </div>

            {memosLoading ? (
              <div className="empty-state">불러오는 중...</div>
            ) : memos.length === 0 ? (
              <div className="surface-card empty-state">
                작성한 메모가 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {memos.map((m) => (
                  <div key={m.id} className="surface-card p-3">
                    {editingId === m.id ? (
                      <div>
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          rows={3}
                          className="field-auto w-full"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="btn btn-default">
                            취소
                          </button>
                          <button onClick={saveEdit} className="btn btn-primary">
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="fg-subtle text-ui-sm tabular-nums">{m.created_at?.slice(0, 19).replace("T", " ")}</span>
                          <div className="flex gap-2">
                            <button onClick={() => startEdit(m)} className="fg-muted text-ui-sm font-medium hover:underline">
                              수정
                            </button>
                            <button onClick={() => handleDeleteMemo(m.id)} className="text-ui-sm font-medium text-error-600 hover:underline dark:text-error-400">
                              삭제
                            </button>
                          </div>
                        </div>
                        <div className="fg-base whitespace-pre-wrap text-ui">{m.content}</div>
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
