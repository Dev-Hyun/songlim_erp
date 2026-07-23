"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AdminOrdersClient from "@/components/supply/AdminOrdersClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default function SupplyOrdersPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="소모품 발주 내역" />
        <AdminOrdersClient />
      </div>
    </StaffOnly>
  );
}
