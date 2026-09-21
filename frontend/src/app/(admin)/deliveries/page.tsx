import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveriesListClient from "@/components/deliveries/DeliveriesListClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "초음파 & 유지보수 현황 | 송림 ERP",
};

export default function DeliveriesPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="초음파 & 유지보수 현황" />
        {/* DEMO는 /deliveries/demo 로 분리됐다 — 이 화면은 항상 납품&관리만 본다 */}
        <DeliveriesListClient fixedSiteType="delivery" />
      </div>
    </StaffOnly>
  );
}
