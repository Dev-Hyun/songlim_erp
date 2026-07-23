"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import AdminHospitalsClient from "@/components/supply/AdminHospitalsClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default function AdminHospitalsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="병원 관리" />
        <AdminHospitalsClient />
      </div>
    </StaffOnly>
  );
}
