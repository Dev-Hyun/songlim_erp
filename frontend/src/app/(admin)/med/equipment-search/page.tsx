import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import EquipmentSearchClient from "@/components/med/EquipmentSearchClient";

export const metadata: Metadata = {
  title: "의료기관 장비 검색 | 송림 ERP",
  description: "심평원 의료장비 신고 데이터로 장비 분류·제조사·모델·지역별 보유 의료기관을 검색합니다.",
};

export default function MedEquipmentSearchPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="의료기관 장비 검색" />
        <EquipmentSearchClient />
      </div>
    </StaffOnly>
  );
}
