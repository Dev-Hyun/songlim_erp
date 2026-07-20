"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
  is_admin: boolean;
  department: string | null;
  position: string | null;
}

interface GradeRow {
  grade_code: string;
  grade_type: string;
  label: string;
  discount_rate: number | null;
  gift_policy_note: string | null;
  sort_order: number;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGrade, setNewGrade] = useState({ grade_code: "", grade_type: "discount", label: "", discount_rate: "" });

  function load() {
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/admin/users`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/admin/grades`, { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([u, g]) => { setUsers(u); setGrades(g); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user?.is_admin) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggleAdmin(uid: number, isAdmin: boolean) {
    await fetch(`${API}/api/admin/users/${uid}/admin?is_admin=${!isAdmin}`, { method: "PATCH", credentials: "include" });
    load();
  }

  async function addGrade() {
    if (!newGrade.grade_code || !newGrade.label) return;
    await fetch(`${API}/api/admin/grades`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        grade_code: newGrade.grade_code,
        grade_type: newGrade.grade_type,
        label: newGrade.label,
        discount_rate: newGrade.discount_rate ? Number(newGrade.discount_rate) : null,
        sort_order: grades.length,
      }),
    });
    setNewGrade({ grade_code: "", grade_type: "discount", label: "", discount_rate: "" });
    load();
  }

  async function deleteGrade(code: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${API}/api/admin/grades/${code}`, { method: "DELETE", credentials: "include" });
    load();
  }

  if (authLoading || loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  if (!user?.is_admin) {
    return (
      <div>
        <PageBreadcrumb pageTitle="관리자페이지" />
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
          관리자 등급 계정만 접근 가능합니다
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="관리자페이지" />

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-white/90">등급 관리 (할인율/사은품)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
              <th className="py-1.5">코드</th>
              <th className="py-1.5">유형</th>
              <th className="py-1.5">라벨</th>
              <th className="py-1.5">할인율</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.grade_code} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5">{g.grade_code}</td>
                <td className="py-1.5">{g.grade_type === "discount" ? "할인" : "사은품"}</td>
                <td className="py-1.5">{g.label}</td>
                <td className="py-1.5">{g.discount_rate ?? "-"}</td>
                <td><button onClick={() => deleteGrade(g.grade_code)} className="text-error-500">×</button></td>
              </tr>
            ))}
            <tr>
              <td><input value={newGrade.grade_code} onChange={(e) => setNewGrade({ ...newGrade, grade_code: e.target.value })} placeholder="코드" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
              <td>
                <select value={newGrade.grade_type} onChange={(e) => setNewGrade({ ...newGrade, grade_type: e.target.value })} className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900">
                  <option value="discount">할인</option>
                  <option value="gift">사은품</option>
                </select>
              </td>
              <td><input value={newGrade.label} onChange={(e) => setNewGrade({ ...newGrade, label: e.target.value })} placeholder="라벨" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
              <td><input value={newGrade.discount_rate} onChange={(e) => setNewGrade({ ...newGrade, discount_rate: e.target.value })} placeholder="%" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
              <td><button onClick={addGrade} className="text-brand-500">+</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-white/90">사용자 목록</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
              <th className="py-1.5">아이디</th>
              <th className="py-1.5">이름</th>
              <th className="py-1.5">역할</th>
              <th className="py-1.5">부서/직급</th>
              <th className="py-1.5">관리자</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5">{u.username}</td>
                <td className="py-1.5">{u.display_name}</td>
                <td className="py-1.5">{u.role === "songrim" ? "송림" : "병원"}</td>
                <td className="py-1.5">{u.department ? `${u.department} · ${u.position}` : "-"}</td>
                <td className="py-1.5">
                  <button
                    onClick={() => toggleAdmin(u.id, u.is_admin)}
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.is_admin ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"}`}
                  >
                    {u.is_admin ? "관리자" : "일반"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
