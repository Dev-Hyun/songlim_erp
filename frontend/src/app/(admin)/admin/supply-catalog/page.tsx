"use client";

import { useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AdminCatalogClient from "@/components/supply/AdminCatalogClient";
import AdminGiftClient from "@/components/supply/AdminGiftClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default function AdminSupplyCatalogPage() {
  const [tab, setTab] = useState<"catalog" | "gift">("catalog");

  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="소모품 관리" />
        <div className="mb-4 flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]" style={{ width: "fit-content" }}>
          <button
            onClick={() => setTab("catalog")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${tab === "catalog" ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}
          >
            카탈로그
          </button>
          <button
            onClick={() => setTab("gift")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${tab === "gift" ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}
          >
            사은품 관리
          </button>
        </div>
        {tab === "catalog" ? <AdminCatalogClient /> : <AdminGiftClient />}
      </div>
    </StaffOnly>
  );
}
