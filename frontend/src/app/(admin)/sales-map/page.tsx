import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SalesMapClient from "@/components/sales-map/SalesMapClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "영업지도 | 송림 ERP",
  description: "장비 보유 현황 기반 영업지도",
};

export default function SalesMapPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="영업지도" />
        <SalesMapClient />
      </div>
    </StaffOnly>
  );
}
