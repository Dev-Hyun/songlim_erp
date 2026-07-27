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
  is_approved: boolean;
  department: string | null;
  position: string | null;
  hospital_name: string | null;
  phone: string | null;
  email: string | null;
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
  const [newGrade, setNewGrade] = useState({ grade_code: "", label: "", discount_rate: "" });
  const [userSearch, setUserSearch] = useState("");

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

  async function approveUser(uid: number) {
    await fetch(`${API}/api/admin/users/${uid}/approve`, { method: "PATCH", credentials: "include" });
    load();
  }

  async function deleteUser(uid: number, username: string) {
    if (!confirm(`${username} 계정을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    const res = await fetch(`${API}/api/admin/users/${uid}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || "삭제에 실패했습니다");
      return;
    }
    load();
  }

  async function resetPassword(uid: number, username: string) {
    const pw = window.prompt(`${username} 계정의 새 비밀번호를 입력하세요 (4자 이상)`);
    if (!pw) return;
    const res = await fetch(`${API}/api/admin/users/${uid}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ new_password: pw }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.detail || "비밀번호 초기화에 실패했습니다");
      return;
    }
    alert("비밀번호가 초기화되었습니다");
  }

  async function addGrade() {
    if (!newGrade.grade_code || !newGrade.label) return;
    await fetch(`${API}/api/admin/grades`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        grade_code: newGrade.grade_code,
        grade_type: "discount",
        label: newGrade.label,
        discount_rate: newGrade.discount_rate ? Number(newGrade.discount_rate) : null,
        sort_order: grades.length,
      }),
    });
    setNewGrade({ grade_code: "", label: "", discount_rate: "" });
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

  const pendingUsers = users.filter((u) => !u.is_approved);
  const uq = userSearch.trim().toLowerCase();
  const visibleUsers = uq
    ? users.filter((u) =>
        `${u.username} ${u.display_name || ""} ${u.department || ""} ${u.position || ""} ${u.hospital_name || ""} ${u.phone || ""} ${u.email || ""}`
          .toLowerCase()
          .includes(uq)
      )
    : users;

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="관리자페이지" />

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-white/90">회원가입 승인 대기 ({pendingUsers.length})</h2>
        {pendingUsers.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-400">승인 대기 중인 계정이 없습니다</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
                <th className="py-1.5">아이디</th>
                <th className="py-1.5">이름</th>
                <th className="py-1.5">구분</th>
                <th className="py-1.5">부서/직급 · 병원명</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1.5">{u.username}</td>
                  <td className="py-1.5">{u.display_name}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${u.role === "songrim" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400" : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"}`}>
                      {u.role === "songrim" ? "송림직원" : "병원"}
                    </span>
                  </td>
                  <td className="py-1.5">{u.role === "songrim" ? (u.department ? `${u.department} · ${u.position}` : "-") : (u.hospital_name || "-")}</td>
                  <td className="py-1.5">
                    <button onClick={() => approveUser(u.id)} className="rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">승인</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-white/90">등급 관리 (할인율)</h2>
        <p className="mb-3 text-[11px] text-gray-400">사은품 등급/구간 설정은 소모품 카탈로그 관리 → 사은품 관리 탭으로 옮겨졌습니다.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
              <th className="py-1.5">코드</th>
              <th className="py-1.5">라벨</th>
              <th className="py-1.5">할인율</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {grades.filter((g) => g.grade_type === "discount").map((g) => (
              <tr key={g.grade_code} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5">{g.grade_code}</td>
                <td className="py-1.5">{g.label}</td>
                <td className="py-1.5">{g.discount_rate ?? "-"}</td>
                <td><button onClick={() => deleteGrade(g.grade_code)} className="text-error-500">×</button></td>
              </tr>
            ))}
            <tr>
              <td><input value={newGrade.grade_code} onChange={(e) => setNewGrade({ ...newGrade, grade_code: e.target.value })} placeholder="코드" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
              <td><input value={newGrade.label} onChange={(e) => setNewGrade({ ...newGrade, label: e.target.value })} placeholder="라벨" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
              <td><input value={newGrade.discount_rate} onChange={(e) => setNewGrade({ ...newGrade, discount_rate: e.target.value })} placeholder="%" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" /></td>
              <td><button onClick={addGrade} className="text-brand-500">+</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-gray-800 dark:text-white/90">사용자 목록 ({visibleUsers.length})</h2>
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="🔍 아이디/이름/부서·직급/병원명/연락처로 검색"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 sm:w-80"
          />
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
              <th className="py-1.5">아이디</th>
              <th className="py-1.5">이름</th>
              <th className="py-1.5">구분</th>
              <th className="py-1.5">부서/직급 · 병원명</th>
              <th className="py-1.5">연락처</th>
              <th className="py-1.5">승인상태</th>
              <th className="py-1.5">관리자</th>
              <th className="py-1.5">비밀번호</th>
              <th className="py-1.5">삭제</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5">{u.username}</td>
                <td className="py-1.5">{u.display_name}</td>
                <td className="py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${u.role === "songrim" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400" : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"}`}>
                    {u.role === "songrim" ? "송림직원" : "병원"}
                  </span>
                </td>
                <td className="py-1.5">{u.role === "songrim" ? (u.department ? `${u.department} · ${u.position}` : "-") : (u.hospital_name || "-")}</td>
                <td className="py-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <div>{u.phone || "-"}</div>
                  {u.email && <div className="text-[11px] text-gray-400">{u.email}</div>}
                </td>
                <td className="py-1.5">
                  {u.is_approved ? (
                    <span className="text-xs text-success-600 dark:text-success-400">승인됨</span>
                  ) : (
                    <button onClick={() => approveUser(u.id)} className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">승인 대기 · 승인하기</button>
                  )}
                </td>
                <td className="py-1.5">
                  <button
                    onClick={() => toggleAdmin(u.id, u.is_admin)}
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.is_admin ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"}`}
                  >
                    {u.is_admin ? "관리자" : "일반"}
                  </button>
                </td>
                <td className="py-1.5">
                  <button onClick={() => resetPassword(u.id, u.username)} className="text-xs font-semibold text-gray-500 hover:text-brand-500 dark:text-gray-400">
                    초기화
                  </button>
                </td>
                <td className="py-1.5">
                  {u.username !== "admin" && (
                    <button onClick={() => deleteUser(u.id, u.username)} className="text-xs font-semibold text-error-500 hover:underline">
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length > 0 && visibleUsers.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">&quot;{userSearch}&quot; 검색 결과가 없습니다</div>
        )}
        </div>
      </div>

    </div>
  );
}
