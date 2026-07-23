"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AdminCatalogClient from "@/components/supply/AdminCatalogClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default function AdminSupplyCatalogPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="소모품 카탈로그 관리" />
        <AdminCatalogClient />
      </div>
    </StaffOnly>
  );
}
