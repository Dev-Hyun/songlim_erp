import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import OpeningsClient from "@/components/med/OpeningsClient";

export const metadata: Metadata = {
  title: "의료기관 개설 현황 | 송림 ERP",
  description: "심평원 개설일자 기준 신규 개설 추이와 지역·종별 분포를 확인합니다.",
};

export default function MedOpeningsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="의료기관 개설 현황" />
        <OpeningsClient />
      </div>
    </StaffOnly>
  );
}
