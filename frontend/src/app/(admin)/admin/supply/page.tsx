"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AdminSupplyClient from "@/components/supply/AdminSupplyClient";
import { useAuth } from "@/context/AuthContext";

export default function AdminSupplyPage() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user?.is_admin) {
    return (
      <div>
        <PageBreadcrumb pageTitle="소모품 발주 관리" />
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
          관리자 등급 계정만 접근 가능합니다
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="소모품 발주 관리" />
      <AdminSupplyClient />
    </div>
  );
}
