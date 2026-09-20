import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import OpeningsClient from "@/components/med/OpeningsClient";

export const metadata: Metadata = {
  title: "의료기관 개설현황 | 송림 ERP",
  description: "행정안전부 인허가 데이터 기준 신규 개설 추이와 지역·진료과 분포를 확인합니다.",
};

export default function MedOpeningsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb
          pageTitle="의료기관 개설현황"
          description="신규 개설·진료과 변화와 수도권·비수도권 차이를 함께 보는 개설현황 인사이트입니다."
        />
        <OpeningsClient />
      </div>
    </StaffOnly>
  );
}
