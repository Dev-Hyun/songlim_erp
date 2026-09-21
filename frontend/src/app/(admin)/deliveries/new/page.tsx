import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveryCreateClient from "@/components/deliveries/DeliveryCreateClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "새 납품 등록 | 송림 ERP",
};

export default function DeliveryNewPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="새 납품 등록" />
        {/* DEMO는 /deliveries/demo/new 로 분리됐다 — 이 화면은 항상 납품 등록만 한다 */}
        <DeliveryCreateClient fixedSiteType="delivery" />
      </div>
    </StaffOnly>
  );
}
