import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import DistributionClient from "@/components/med/DistributionClient";

export const metadata: Metadata = {
  title: "의료기관 분포현황 | 송림 ERP",
  description: "시도·시군구별 의료기관 분포와 장비 보유 현황을 지도와 표로 확인합니다.",
};

export default function MedDistributionPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="의료기관 분포현황" />
        <DistributionClient />
      </div>
    </StaffOnly>
  );
}
