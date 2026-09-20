import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import CatalogManufacturersClient from "@/components/med/CatalogManufacturersClient";

export const metadata: Metadata = {
  title: "의료장비 제조·수입사 | 송림 ERP",
  description: "장비 등록 기록과 연결된 제조·수입사별 모델 수와 등록 현황을 확인합니다.",
};

export default function MedEquipmentManufacturersPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb
          pageTitle="의료장비 제조·수입사"
          description="업체를 누르면 연결된 장비 분류가 펼쳐집니다."
        />
        <CatalogManufacturersClient />
      </div>
    </StaffOnly>
  );
}
