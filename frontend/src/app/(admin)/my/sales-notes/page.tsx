"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";
import { fetchMySalesNotes } from "@/components/sales-map/api";
import { SalesNoteItem } from "@/components/sales-map/types";

export default function MySalesNotesPage() {
  const { user, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<SalesNoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchMySalesNotes(user.id).then(setNotes).finally(() => setLoading(false));
  }, [user]);

  return (
    <div>
      <PageBreadcrumb pageTitle="영업노트" />
      {authLoading || loading ? (
        <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      ) : !user ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
          로그인이 필요합니다
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
          작성한 영업노트가 없습니다. 영업지도에서 병원을 선택해 작성해보세요.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{n.hospital_name}</span>
                <span className="text-xs text-gray-400">{n.visit_date || n.created_at?.slice(0, 10)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{n.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
